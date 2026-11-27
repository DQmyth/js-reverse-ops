#!/usr/bin/env python3
"""audit_browser_free — run a command and report whether any local browser took part.

The delivery principle is zero-browser, and "was that really solved without a
browser?" is the first question a result gets. Answering it from memory is how
unchecked claims ship (see misdiagnosis M15). This tool answers it from the
operating system: for the whole lifetime of the command it samples

  - the process tree (ps)  — every descendant's executable name, plus the
                             browser-automation flags on its command line
  - the TCP table  (lsof)  — every peer the tree connects to

and fails the run on any of: a browser engine executable in the tree, an
automation flag on a command line, or a connection to a loopback address
(browser debug ports such as 9222 / 9515 live on localhost).

Usage:
  python3 scripts/audit_browser_free.py [--json] [--report <file>] [--interval 0.2] -- <command> [args...]

The subject's stdout is left alone; the audit report goes to stderr (so
`audit ... -- cmd > out` still captures the subject's output). The subject's
own stderr lands on that same stream — pass `--report <file>` whenever a
program has to read the report.

Exit 0 = PASS (no local browser evidence), 1 = FAIL (browser evidence found),
2 = usage error, missing tooling, or INCONCLUSIVE. INCONCLUSIVE covers a run
too short to sample and a subject that exited non-zero: a flow that never
completed proves nothing about itself, so it is never reported as a pass
(found the hard way — a subject dying on a network error came back "PASS").
A verdict is only as good as its coverage; the report always carries the
sample count, the duration and the subject's exit code.

What a pass does NOT prove: a browser reached over a non-loopback address
(a remote debug endpoint) shows up only as an ordinary remote peer, and a
child process that lives shorter than the sampling interval can be missed.
Read PASS as "no local browser evidence", never as proof of purity alone.
"""
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import threading
import time

BROWSER_EXECUTABLES = {
    'google chrome', 'google chrome for testing', 'chrome', 'chrome for testing', 'chromium',
    'chromium-browser', 'chrome headless shell', 'chromeheadlessshell', 'headless_shell',
    'chromedriver', 'firefox', 'firefox-bin', 'geckodriver', 'waterfox', 'librewolf',
    'msedge', 'microsoft edge', 'microsoft edge beta', 'microsoft edge dev', 'msedgedriver',
    'safaridriver', 'camoufox', 'brave browser', 'brave', 'vivaldi', 'opera', 'yandex',
    'phantomjs', 'electron',
}
AUTOMATION_FLAGS = (
    '--remote-debugging-port', '--remote-debugging-pipe', '--headless', '--enable-automation',
    'chromedriver', 'geckodriver', 'msedgedriver', 'safaridriver', 'puppeteer', 'playwright',
    'selenium', 'webdriver',
)
PEER_RE = re.compile(r'TCP\s+\S+?->(\S+?)\s+\(\w+\)')


def ps_table():
    out = subprocess.run(['ps', '-axo', 'pid=,ppid=,comm='], capture_output=True, text=True).stdout
    parents, names = {}, {}
    for line in out.splitlines():
        parts = line.strip().split(None, 2)
        if len(parts) == 3:
            pid, ppid = int(parts[0]), int(parts[1])
            parents[pid] = ppid
            # `comm` is the last column, so a path containing spaces survives
            names[pid] = parts[2].rsplit('/', 1)[-1].strip('()')
    return parents, names


def tree_of(root, parents):
    family = {root}
    for _ in range(32):
        grown = {pid for pid, ppid in parents.items() if ppid in family} - family
        if not grown:
            break
        family |= grown
    return family


def command_lines(pids):
    out = subprocess.run(['ps', '-ww', '-o', 'pid=,args=', '-p', ','.join(str(p) for p in pids)],
                         capture_output=True, text=True).stdout
    lines = {}
    for line in out.splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) == 2:
            lines[int(parts[0])] = parts[1]
    return lines


def tcp_peers(pids):
    out = subprocess.run(['lsof', '-nP', '-a', '-p', ','.join(str(p) for p in pids), '-iTCP'],
                         capture_output=True, text=True)
    return PEER_RE.findall(out.stdout)


def is_loopback(peer):
    host = peer.rsplit(':', 1)[0].strip('[]')
    return host == '::1' or host == 'localhost' or host.startswith('127.')


def watch(root, interval, state, stop):
    while True:
        parents, names = ps_table()
        family = tree_of(root, parents)
        state['processes'].update(names[pid] for pid in family if pid in names)
        state['peers'].update(tcp_peers(family))
        lowered = [args.lower() for args in command_lines(family).values()]
        state['flags'].update(flag for flag in AUTOMATION_FLAGS if any(flag in args for args in lowered))
        state['samples'] += 1
        if stop.wait(interval):
            return


def main():
    argv = sys.argv[1:]
    sep = argv.index('--') if '--' in argv else len(argv)
    own, command = argv[:sep], argv[sep + 1:]
    want_json = '--json' in own
    report_path = None
    if '--report' in own:
        at = own.index('--report')
        report_path = own[at + 1] if at + 1 < len(own) and not own[at + 1].startswith('--') else None
        if report_path is None:
            print('usage: --report needs a file path', file=sys.stderr)
            return 2
    interval = 0.2
    if '--interval' in own:
        at = own.index('--interval')
        try:
            interval = float(own[at + 1])
        except (IndexError, ValueError):
            interval = -1.0
    if not command or interval <= 0:
        print('usage: audit_browser_free.py [--json] [--report <file>] [--interval 0.2] -- <command> [args...]', file=sys.stderr)
        return 2
    if platform.system() not in ('Darwin', 'Linux') or not shutil.which('ps') or not shutil.which('lsof'):
        report = {'verdict': 'INCONCLUSIVE', 'reasons': ['needs ps and lsof on macOS or Linux']}
        print(json.dumps(report) if want_json else 'verdict: INCONCLUSIVE — needs ps and lsof on macOS or Linux', file=sys.stderr)
        return 2

    state = {'processes': set(), 'peers': set(), 'flags': set(), 'samples': 0}
    stop = threading.Event()
    started = time.time()
    subject = subprocess.Popen(command)
    watcher = threading.Thread(target=watch, args=(subject.pid, interval, state, stop), daemon=True)
    watcher.start()
    subject.wait()
    duration = time.time() - started
    time.sleep(interval)          # let an in-flight sample finish
    stop.set()
    watcher.join(timeout=10)

    processes = sorted(state['processes'])
    loopback = sorted(p for p in state['peers'] if is_loopback(p))
    remotes = sorted(p for p in state['peers'] if not is_loopback(p))
    flags = sorted(state['flags'])
    engines = sorted(p for p in processes if p.lower() in BROWSER_EXECUTABLES)
    reasons = []
    if engines:
        reasons.append('browser engine process in the tree: %s' % ', '.join(engines))
    if flags:
        reasons.append('browser-automation flags on a command line: %s' % ', '.join(flags))
    if loopback:
        reasons.append('loopback TCP connections: %s' % ', '.join(loopback))
    gaps = []
    if state['samples'] < 3:
        gaps.append('only %d samples in %.1fs — too short to audit' % (state['samples'], duration))
    if not reasons and subject.returncode != 0:
        gaps.append('subject exited with code %s — it did not complete, so nothing is proven about a successful run'
                    % subject.returncode)
    verdict = 'FAIL' if reasons else ('INCONCLUSIVE' if gaps else 'PASS')
    reasons = gaps + reasons

    report = {
        'verdict': verdict,
        'reasons': reasons,
        'command_exit_code': subject.returncode,
        'duration_s': round(duration, 2),
        'samples': state['samples'],
        'processes_in_tree': processes,
        'browser_engines': engines,
        'automation_flags': flags,
        'loopback_peers': loopback,
        'remote_ports': sorted({p.rsplit(':', 1)[1] for p in remotes}),
        'remote_peer_count': len(remotes),
    }
    if want_json:
        body = json.dumps(report)
    else:
        body = 'verdict: %s — %s (%d samples over %.1fs, subject exit %s)\n' % (
            verdict, 'browser evidence found' if verdict == 'FAIL' else ('cannot tell' if verdict == 'INCONCLUSIVE' else 'no local browser evidence'),
            state['samples'], duration, subject.returncode)
        body += ''.join('  ! %s\n' % reason for reason in reasons)
        body += '  processes in tree: %s\n' % (', '.join(processes) or '(none)')
        body += '  loopback connections: %s\n' % (', '.join(loopback) or 'none')
        body += '  remote peers: %d addresses, ports %s\n' % (len(remotes), ', '.join(report['remote_ports']) or 'none')
    print(body, end='' if want_json else '', file=sys.stderr)
    if report_path:
        with open(report_path, 'w') as handle:
            handle.write(body + ('\n' if want_json else ''))
    return {'PASS': 0, 'FAIL': 1, 'INCONCLUSIVE': 2}[verdict]


if __name__ == '__main__':
    sys.exit(main())

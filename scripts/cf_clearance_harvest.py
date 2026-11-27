#!/usr/bin/env python3
"""cf_clearance_harvest — clear a Cloudflare challenge page request-based
(cfsolve), then hand back a replayable clearance: the cookie plus the EXACT
User-Agent it is bound to, read from the profile file (never typed by hand).

Why this exists: the solver is only needed for the acquisition step. A
clearance is bound to (exit IP, User-Agent) and NOT to the TLS stack, so
plain HTTP from any client works afterwards — verified 2026-11-27 with
controlled comparisons (references/cf-gate-triage.md, misdiagnosis M15:
the earlier "TLS-stack-bound" claim came from a hand-typed UA).

The solver binary must track Cloudflare's challenge builds. If it stops
clearing a page it cleared days ago, fetch upstream and rebuild before
concluding anything about the target (oberved 2026-11-27: the 11-17 build
failed 0/2, the 11-26 build cleared 5/5 on the same sites).

Usage:
  python3 scripts/cf_clearance_harvest.py <url> --profile <profile.json> \
      [--proxy http://host:port] [--cfsolve <binary>] [--replay] \
      [--impersonate safari180_ios] [--json]

Output: JSON with url, clearance, user_agent, proxy and the solver's debug
directory. With --replay it also fetches the page over plain HTTP
(curl_cffi) using the harvested pair and reports whether a challenge came
back instead. Exit 0 = clearance obtained (and replay clean if requested),
1 = solver failed, 2 = usage/dependency problem, 3 = replay was re-challenged.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from urllib.parse import urlparse

SKILL_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR_BIN = os.path.normpath(os.path.join(SKILL_ROOT, '..', '..', 'vendor', 'cfsolve', 'bin', 'challenge'))
CLEARANCE_RE = re.compile(r'^cf_clearance=(\S+)\s*$', re.M)


def locate_solver(explicit):
    for candidate in (explicit, os.environ.get('CFSOLVE_BIN'), VENDOR_BIN):
        if candidate and os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
        if explicit or os.environ.get('CFSOLVE_BIN'):
            break  # an explicit path was given but is unusable — do not fall back silently
    return None


def read_user_agent(profile_path):
    """The UA a clearance is bound to. Parsed from the profile, never typed."""
    with open(profile_path, encoding='utf-8') as fh:
        profile = json.load(fh)
    try:
        return profile['transport']['headers']['User-Agent']
    except (KeyError, TypeError):
        raise SystemExit('cannot read transport.headers.User-Agent from %s — fix the profile path' % profile_path)


def replay(url, clearance, user_agent, proxy, impersonate, timeout):
    try:
        from curl_cffi import requests
    except ImportError:
        raise SystemExit(2)
    session = requests.Session(impersonate=impersonate)
    session.headers['User-Agent'] = user_agent
    session.cookies.set('cf_clearance', clearance, domain=urlparse(url).hostname, path='/')
    # the replay must leave from the SAME exit IP the clearance was issued for
    proxies = {'https': proxy, 'http': proxy} if proxy else None
    resp = session.get(url, timeout=timeout, allow_redirects=False, proxies=proxies)
    challenged = resp.headers.get('cf-mitigated') == 'challenge' or 'Just a moment' in resp.text[:8000]
    return {'status': resp.status_code, 'body_bytes': len(resp.text), 're_challenged': challenged,
            'impersonate': impersonate}


def main():
    ap = argparse.ArgumentParser(description='harvest a Cloudflare cf_clearance and its bound User-Agent')
    ap.add_argument('url', help='challenge page to clear')
    ap.add_argument('--profile', required=True, help='cfsolve browser profile (e.g. safari-26-ios.json)')
    ap.add_argument('--proxy', default=None, help='http(s)/socks proxy used for solving AND replay')
    ap.add_argument('--cfsolve', default=None, help='path to the cfsolve "challenge" binary')
    ap.add_argument('--replay', action='store_true', help='also fetch the page over plain HTTP with the harvested pair')
    ap.add_argument('--impersonate', default='safari180_ios', help='curl_cffi impersonation for --replay')
    ap.add_argument('--json', action='store_true', help='print the full JSON result (includes the clearance)')
    ap.add_argument('--timeout', type=int, default=240, help='solver wall-clock limit in seconds')
    args = ap.parse_args()

    solver = locate_solver(args.cfsolve)
    if not solver:
        print('cfsolve binary not found — build it (cargo build --release --bin challenge) or pass --cfsolve',
              file=sys.stderr)
        return 2
    user_agent = read_user_agent(args.profile)

    debug_dir = tempfile.mkdtemp(prefix='cfsolve-')
    cmd = [solver, '--page', args.url, debug_dir, '--solve', '--fingerprint', args.profile]
    if args.proxy:
        cmd += ['--proxy', args.proxy]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=args.timeout)
    except subprocess.TimeoutExpired:
        print('solver timed out after %ss' % args.timeout, file=sys.stderr)
        return 1
    output = (proc.stdout or '') + '\n' + (proc.stderr or '')
    match = CLEARANCE_RE.search(output)
    if proc.returncode != 0 or not match:
        tail = [line[:160] for line in output.strip().splitlines()[-3:]]
        print('solver did not clear the challenge (exit %s): %s' % (proc.returncode, ' | '.join(tail)), file=sys.stderr)
        print('if this page cleared with an older binary, CF likely shipped a new challenge build — '
              'fetch upstream and rebuild', file=sys.stderr)
        return 1

    result = {
        'url': args.url,
        'clearance': match.group(1),
        'user_agent': user_agent,
        'proxy': args.proxy,
        'debug_dir': debug_dir,
    }
    if args.replay:
        result['replay'] = replay(args.url, result['clearance'], user_agent, args.proxy, args.impersonate, 30)

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        summary = {k: v for k, v in result.items() if k != 'clearance'}
        summary['clearance'] = '%s... (%d chars)' % (result['clearance'][:12], len(result['clearance']))
        print(json.dumps(summary, indent=2))
    if args.replay:
        status = result['replay']['status']
        if result['replay']['re_challenged'] or status != 200:
            print('replay was NOT clean — the pair did not hold for this exit/UA', file=sys.stderr)
            return 3
        print('replay clean: protected page fetched over plain HTTP with the harvested clearance')
    return 0


if __name__ == '__main__':
    sys.exit(main())

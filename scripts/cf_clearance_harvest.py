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
concluding anything about the target (observed 2026-11-27: the 11-17 build
failed 0/2, the 11-26 build cleared 5/5 on the same sites).

Two things learned on the first production target (2026-11-27): challenge
rules can be path-scoped, so point <url> at something that is actually
challenged (the protected resource itself works); and binary resources
must be downloaded by a normal client like this one — the solver's CLI
saves its own cleared copy decoded as text, which corrupts binaries.

It needs the third-party request-level solver cfsolve, which does NOT ship
with this skill, and curl_cffi for --replay. Point the tool at a solver
checkout once and it finds the binary and the bundled profile by itself:

  export CFSOLVE_DIR=~/cfsolve      # or: --cfsolve <binary> [--profile <profile.json>]

Usage:
  python3 scripts/cf_clearance_harvest.py <url> [--profile <profile.json>] \
      [--proxy http://host:port] [--cfsolve <binary>] [--replay] \
      [--impersonate safari180_ios] [--json]

Then fetch the other URLs of the zone with scripts/cf_fetch_with_clearance.py.

Output: JSON with url, clearance, user_agent, proxy and the solver's debug
directory — stdout is parseable JSON under --json (status lines go to
stderr). With --replay it also fetches the resource over plain HTTP
(curl_cffi) using the harvested pair and reports the raw byte count and
whether a challenge came back instead. Exit 0 = clearance obtained (and
replay clean if requested), 1 = solver failed, 2 = usage/dependency
problem, 3 = replay was re-challenged.
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys
import tempfile
from urllib.parse import urlparse

SKILL_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR_BIN = os.path.normpath(os.path.join(SKILL_ROOT, '..', '..', 'vendor', 'cfsolve', 'bin', 'challenge'))
VENDOR_PROFILE = os.path.normpath(os.path.join(SKILL_ROOT, '..', '..', 'vendor', 'cfsolve', 'profiles', 'safari-26-ios.json'))
GET_CFSOLVE = '''cfsolve (the request-level Cloudflare solver) does not ship with this skill — get it once:
  1. install a Rust toolchain plus cmake and libclang        (macOS: brew install rust cmake)
  2. git clone https://github.com/chris124567/cfsolve ~/cfsolve
     cargo build --release --bin challenge --manifest-path ~/cfsolve/Cargo.toml     (~2.5 min)
  3. export CFSOLVE_DIR=~/cfsolve        # the binary and the bundled profile are found from there
It breaks whenever Cloudflare ships a new challenge build: pull upstream, rebuild, re-verify.'''
CLEARANCE_RE = re.compile(r'^cf_clearance=(\S+)\s*$', re.M)


def _usable(path):
    return bool(path) and os.path.isfile(path) and os.access(path, os.X_OK)


def locate_solver(explicit):
    """--cfsolve, then $CFSOLVE_BIN, then $CFSOLVE_DIR/target/release/challenge, then the
    workspace copy. A source that was named explicitly but does not resolve is an error,
    never a silent fallback to something else."""
    directed = explicit or os.environ.get('CFSOLVE_BIN')
    if directed:
        return directed if _usable(directed) else None
    if os.environ.get('CFSOLVE_DIR'):
        candidate = os.path.join(os.environ['CFSOLVE_DIR'], 'target', 'release', 'challenge')
        return candidate if _usable(candidate) else None
    return VENDOR_BIN if _usable(VENDOR_BIN) else None


def default_profile(explicit):
    """The solver's browser profile: --profile, $CFSOLVE_PROFILE, the one shipped in
    $CFSOLVE_DIR/profiles, then the workspace copy."""
    if explicit:
        return explicit
    if os.environ.get('CFSOLVE_PROFILE'):
        return os.environ['CFSOLVE_PROFILE']
    if os.environ.get('CFSOLVE_DIR'):
        folder = os.path.join(os.environ['CFSOLVE_DIR'], 'profiles')
        preferred = os.path.join(folder, 'safari-26-ios.json')
        if os.path.isfile(preferred):
            return preferred
        shipped = sorted(glob.glob(os.path.join(folder, '*.json')))
        if shipped:
            return shipped[0]
    return VENDOR_PROFILE if os.path.isfile(VENDOR_PROFILE) else None


def read_user_agent(profile_path):
    """The UA a clearance is bound to. Parsed from the profile, never typed."""
    try:
        with open(profile_path, encoding='utf-8') as fh:
            profile = json.load(fh)
        return profile['transport']['headers']['User-Agent']
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise SystemExit('cannot read the solver profile %s (%s)\n%s' % (profile_path, exc, GET_CFSOLVE))


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
    # bytes, never .text — the protected resource may be binary (e.g. a PDF)
    body = resp.content
    challenged = resp.headers.get('cf-mitigated') == 'challenge' or b'Just a moment' in body[:8000]
    return {'status': resp.status_code, 'body_bytes': len(body), 're_challenged': challenged,
            'impersonate': impersonate}


def main():
    ap = argparse.ArgumentParser(description='harvest a Cloudflare cf_clearance and its bound User-Agent')
    ap.add_argument('url', help='challenge page to clear')
    ap.add_argument('--profile', default=None, help='cfsolve browser profile (e.g. safari-26-ios.json); defaults to the one shipped with the solver')
    ap.add_argument('--proxy', default=None, help='http(s)/socks proxy used for solving AND replay')
    ap.add_argument('--cfsolve', default=None, help='path to the cfsolve "challenge" binary')
    ap.add_argument('--replay', action='store_true', help='also fetch the page over plain HTTP with the harvested pair')
    ap.add_argument('--impersonate', default='safari180_ios', help='curl_cffi impersonation for --replay')
    ap.add_argument('--json', action='store_true', help='print the full JSON result (includes the clearance)')
    ap.add_argument('--timeout', type=int, default=240, help='solver wall-clock limit in seconds')
    args = ap.parse_args()

    solver = locate_solver(args.cfsolve)
    profile = default_profile(args.profile)
    if not solver or not profile:
        print('cfsolve is not available (%s not found)\n%s' % ('solver binary' if not solver else 'solver profile', GET_CFSOLVE),
              file=sys.stderr)
        return 2
    user_agent = read_user_agent(profile)

    debug_dir = tempfile.mkdtemp(prefix='cfsolve-')
    cmd = [solver, '--page', args.url, debug_dir, '--solve', '--fingerprint', profile]
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
        # status text goes to stderr: stdout must stay parseable JSON under --json
        print('replay clean: protected page fetched over plain HTTP with the harvested clearance', file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())

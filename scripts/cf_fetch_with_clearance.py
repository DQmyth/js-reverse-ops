#!/usr/bin/env python3
"""cf_fetch_with_clearance — fetch URLs through a clearance harvested by
cf_clearance_harvest.py, over plain HTTP (curl_cffi). No solver is involved
at this stage: the solver is only needed for the acquisition step.

A clearance replays from any HTTP client as long as two things match the
acquisition — the exit IP and the User-Agent. Both are in the harvest file,
so the pair is loaded from there, never typed (misdiagnosis M15).

Usage:
  python3 scripts/cf_clearance_harvest.py <challenged url> --json > harvest.json
  python3 scripts/cf_fetch_with_clearance.py --harvest harvest.json --out-dir downloads/ <url> [<url> ...]

Files are saved under their URL basename (binary safe: bytes are
written as read, and the status plus byte count of every fetch is reported). A response
that turns out to be a challenge page means the clearance no longer holds for
this exit/UA (expired, issued from another IP or a changed UA): the run stops
at once instead of hammering — re-harvest.

Exit 0 = all fetched, 1 = some fetch failed, 2 = usage or dependency problem,
3 = re-challenged. Needs curl_cffi (pip install -r requirements.txt).
"""
import argparse
import json
import os
import sys
import time
from urllib.parse import urlparse

TRIES = 3        # a single dropped connection is common on these edges
PAUSE = 2.0


def same_zone(host, zone):
    return host == zone or host.endswith('.' + zone) or zone.endswith('.' + host)


def is_challenge(resp, body):
    if resp.headers.get('cf-mitigated'):
        return True
    ctype = (resp.headers.get('content-type') or '').lower()
    return 'text/html' in ctype and b'Just a moment' in body[:8000]


def main():
    ap = argparse.ArgumentParser(description='fetch URLs with a harvested cf_clearance over plain HTTP')
    ap.add_argument('--harvest', required=True, help='JSON produced by cf_clearance_harvest.py --json')
    ap.add_argument('--out-dir', default=None, help='save each body as <basename> here (default: discard bodies)')
    ap.add_argument('--json', action='store_true', help='print a JSON report')
    ap.add_argument('urls', nargs='+')
    args = ap.parse_args()

    try:
        from curl_cffi import requests
    except ImportError:
        print('curl_cffi is missing — pip install -r requirements.txt', file=sys.stderr)
        return 2
    try:
        with open(args.harvest, encoding='utf-8') as handle:
            pair = json.load(handle)
        clearance, user_agent = pair['clearance'], pair['user_agent']
        zone = urlparse(pair['url']).hostname
        proxies = {'https': pair['proxy'], 'http': pair['proxy']} if pair.get('proxy') else None
    except (OSError, ValueError, KeyError) as exc:
        print('cannot use the harvest file %s (%s) — produce it with cf_clearance_harvest.py --json'
              % (args.harvest, exc), file=sys.stderr)
        return 2

    # the clearance was issued for one exit + one UA: both are reused exactly
    session = requests.Session(impersonate='safari180_ios')
    session.headers['User-Agent'] = user_agent
    if args.out_dir:
        os.makedirs(args.out_dir, exist_ok=True)

    results, re_challenged = [], False
    for url in args.urls:
        host = urlparse(url).hostname
        if not same_zone(host, zone):
            results.append({'url': url, 'status': None, 'bytes': 0, 'error': 'different host — a clearance is issued per zone'})
            continue
        session.cookies.set('cf_clearance', clearance, domain=host, path='/')
        body, status, resp, error = b'', None, None, None
        for attempt in range(TRIES):
            try:
                resp = session.get(url, timeout=180, allow_redirects=False, proxies=proxies)
                body, status = resp.content, resp.status_code
                break
            except Exception as exc:  # noqa: BLE001 — a transport hiccup is retried, then reported
                error = '%s: %s' % (type(exc).__name__, str(exc)[:80])
                if attempt + 1 < TRIES:
                    time.sleep(PAUSE)
        record = {'url': url, 'status': status, 'bytes': len(body)}
        if error:
            record['error'] = error
        elif is_challenge(resp, body):
            record['error'] = 'challenge page served — the clearance no longer holds for this exit/UA'
            re_challenged = True
        else:
            record['content_type'] = resp.headers.get('content-type')
            record['location'] = resp.headers.get('location')
            if args.out_dir:
                target = os.path.join(args.out_dir, os.path.basename(urlparse(url).path) or 'index.bin')
                with open(target, 'wb') as handle:
                    handle.write(body)
                record['saved'] = target
        results.append(record)
        if re_challenged:
            break
    done = [r for r in results if r['status'] == 200 and 'error' not in r]
    if args.json:
        print(json.dumps({'fetched': len(done), 'of': len(args.urls), 're_challenged': re_challenged, 'results': results}, indent=1))
    else:
        for r in results:
            flag = 'OK  ' if r in done else 'FAIL'
            print('%s %-34s %s %8s bytes%s' % (flag, os.path.basename(urlparse(r['url']).path) or r['url'][:34], r['status'], r['bytes'],
                                             ('  ' + r['error']) if r.get('error') else ('  -> ' + r['saved'] if r.get('saved') else '')))
        print('fetched %d/%d' % (len(done), len(args.urls)))
        if re_challenged:
            print('the site answered with a challenge page — re-harvest a clearance for this exit IP and UA', file=sys.stderr)
    if re_challenged:
        return 3
    return 0 if len(done) == len(args.urls) else 1


if __name__ == '__main__':
    sys.exit(main())

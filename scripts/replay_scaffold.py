#!/usr/bin/env python3
import json
import sys
from pathlib import Path

TEMPLATE = '''import json
import time
import hashlib
import requests


class ReverseReplay:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.session.headers.update({{
            "User-Agent": "Mozilla/5.0",
        }})

    def build_payload(self, raw_params):
        return raw_params

    def build_headers(self, payload):
        timestamp = str(int(time.time() * 1000))
        sign = self.generate_signature(payload, timestamp)
        return {{
            "Content-Type": "application/json",
            "timestamp": timestamp,
            "sign": sign,
        }}

    def generate_signature(self, payload, timestamp):
        material = json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + timestamp
        return hashlib.md5(material.encode("utf-8")).hexdigest()

    def request(self, method, path, raw_params):
        payload = self.build_payload(raw_params)
        headers = self.build_headers(payload)
        url = self.base_url + path
        if method.upper() == "GET":
            response = self.session.get(url, params=payload, headers=headers)
        else:
            response = self.session.post(url, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()


if __name__ == "__main__":
    replay = ReverseReplay(base_url="{base_url}")
    sample = {sample_payload}
    print(json.dumps(replay.request("{method}", "{path}", sample), ensure_ascii=False, indent=2))
'''


def main():
    if len(sys.argv) != 3:
        print("Usage: replay_scaffold.py <evidence.json> <output.py>", file=sys.stderr)
        return 1

    evidence = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    output = Path(sys.argv[2])

    base_url = evidence.get('base_url', 'https://example.com')
    path = evidence.get('path', '/api/example')
    method = evidence.get('method', 'POST')
    sample_payload = json.dumps(evidence.get('sample_payload', {'hello': 'world'}), ensure_ascii=False)

    output.write_text(
        TEMPLATE.format(base_url=base_url, path=path, method=method, sample_payload=sample_payload),
        encoding='utf-8',
    )
    print(f'wrote {output}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

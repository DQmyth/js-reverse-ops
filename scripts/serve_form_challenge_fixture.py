#!/usr/bin/env python3
import argparse
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8138)
    parser.add_argument("--page", required=True)
    parser.add_argument("--page-path", default="/ob0.htm")
    parser.add_argument("--endpoint", required=True)
    parser.add_argument("--expected-field", action="append", default=[])
    args = parser.parse_args()

    page_path = Path(args.page).resolve()
    page_bytes = page_path.read_bytes()
    expected = {}
    for item in args.expected_field:
        if "=" not in item:
            raise SystemExit(f"Invalid --expected-field: {item}")
        key, value = item.split("=", 1)
        expected[key] = value

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args_):
            return

        def do_GET(self):
            if self.path in ("/", args.page_path):
                body = page_bytes
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Connection", "close")
                self.end_headers()
                self.wfile.write(body)
                return
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.send_header("Connection", "close")
            self.end_headers()

        def do_POST(self):
            if self.path != args.endpoint:
                self.send_response(404)
                self.end_headers()
                return
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length).decode("utf-8", errors="replace")
            parsed = {key: values[0] for key, values in parse_qs(body, keep_blank_values=True).items()}
            accepted = all(parsed.get(key) == value for key, value in expected.items())
            response = {
              "accepted": accepted,
              "expected_fields": sorted(expected.keys()),
              "received_fields": sorted(parsed.keys()),
              "received": parsed,
            }
            body_bytes = json.dumps(response).encode("utf-8")
            self.send_response(200 if accepted else 403)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body_bytes)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(body_bytes)

    server = HTTPServer((args.host, args.port), Handler)
    print(json.dumps({
        "host": args.host,
        "port": args.port,
        "page_path": args.page_path,
        "endpoint": args.endpoint,
        "expected_fields": sorted(expected.keys()),
    }))
    server.serve_forever()


if __name__ == "__main__":
    main()

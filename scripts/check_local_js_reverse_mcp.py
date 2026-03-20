#!/usr/bin/env python3
import json
import os
import signal
import subprocess
import sys
import time
import urllib.request


def check_browser(url: str) -> dict:
    with urllib.request.urlopen(f"{url}/json/version", timeout=1.5) as resp:
        return json.load(resp)


def main() -> int:
    browser_url = os.environ.get("BROWSER_URL", "http://127.0.0.1:9222")
    log_file = os.environ.get("LOG_FILE", "/tmp/js-reverse-mcp-local.log")
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    server = os.path.join(project_root, "vendor", "JSReverser-MCP", "build", "src", "index.js")

    try:
        browser = check_browser(browser_url)
    except Exception as exc:
        print(json.dumps({
            "healthy": False,
            "stage": "browser",
            "browser_url": browser_url,
            "error": str(exc),
        }, ensure_ascii=True, indent=2))
        return 1

    with open(log_file, "ab") as logfh:
        proc = subprocess.Popen(
            ["node", server, "--browserUrl", browser_url, "--logFile", log_file],
            cwd=project_root,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=logfh,
        )
        try:
            time.sleep(1.5)
            alive = proc.poll() is None
            status = {
                "healthy": alive,
                "stage": "mcp",
                "browser_url": browser_url,
                "browser": browser.get("Browser"),
                "websocket": browser.get("webSocketDebuggerUrl"),
                "pid": proc.pid,
                "log_file": log_file,
            }
            if not alive:
                status["exit_code"] = proc.returncode
            print(json.dumps(status, ensure_ascii=True, indent=2))
            return 0 if alive else 1
        finally:
            if proc.poll() is None:
                proc.send_signal(signal.SIGTERM)
                try:
                    proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=2)


if __name__ == "__main__":
    sys.exit(main())

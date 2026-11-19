#!/usr/bin/env python3
"""End-to-end capability verifier: solve a real reCAPTCHA v2 challenge and
independently confirm the token from the PAGE (never trust the solver's own
return value). Driver-agnostic — works with plain selenium; the recorded
runs used Google's official demo page.

Mac arm64 gotchas baked into the notes below (each one cost a failed run):
  1. undetected_chromedriver's auto-download can fetch the WRONG arch
     (Bad CPU type, errno 86) — fetch the matching Chrome-for-Testing
     mac-arm64 chromedriver yourself and pass it explicitly
  2. Gatekeeper SIGKILLs (-9) freshly downloaded unsigned drivers —
     `xattr -cr <dir>` then `codesign -s - -f <driver>`
  3. selenium 4 wants Service(driver_path), not executable_path=

Usage:
  HTTPS_PROXY=http://127.0.0.1:7890 python3 verify_recaptcha_capability.py \
      --driver /path/to/chromedriver --chrome '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
      --proxy http://127.0.0.1:7890 --attempts 3
Exit: prints per-attempt page-verified state + final SCORE: n/N.
"""
import argparse
import sys
import time

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service

DEMO = 'https://www.google.com/recaptcha/api2/demo?hl=en'


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--driver', required=True, help='chromedriver binary (match your Chrome version + arch)')
    ap.add_argument('--chrome', default='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    ap.add_argument('--proxy', default=None, help='browser-level proxy, e.g. http://127.0.0.1:7890')
    ap.add_argument('--attempts', type=int, default=3)
    ap.add_argument('--solver-pkg', default=None, help='path to recaptcha_ia_solver checkout (sys.path insert)')
    args = ap.parse_args()

    if args.solver_pkg:
        sys.path.insert(0, args.solver_pkg)
    try:
        from recaptcha_ia_solver import solve_recaptcha
    except ImportError:
        print('recaptcha_ia_solver not importable — install it or pass --solver-pkg', file=sys.stderr)
        return 2

    passed = 0
    for attempt in range(1, args.attempts + 1):
        driver = None
        try:
            opts = Options()
            opts.binary_location = args.chrome
            if args.proxy:
                opts.add_argument(f'--proxy-server={args.proxy}')
            opts.add_argument('--window-size=1280,900')
            opts.add_argument('--no-first-run')
            opts.add_argument('--disable-blink-features=AutomationControlled')
            opts.add_experimental_option('excludeSwitches', ['enable-automation'])
            driver = webdriver.Chrome(service=Service(args.driver), options=opts)
            driver.get(DEMO)
            time.sleep(2)
            t0 = time.time()
            try:
                solve_recaptcha(driver, verbose=False)
            except Exception as e:  # noqa: BLE001 — report and re-verify from the page anyway
                print(f'[attempt {attempt}] solver raised {type(e).__name__}: {str(e)[:90]}', flush=True)
            verified = driver.execute_script(
                'const cb = document.querySelector(".recaptcha-checkbox-checked");'
                'const tok = (document.getElementById("g-recaptcha-response")||{}).value||"";'
                'return {checked: !!cb, tokenLen: tok.length};')
            ok = bool(verified and verified.get('checked')) or (verified or {}).get('tokenLen', 0) > 0
            print(f'[attempt {attempt}/{args.attempts}] page-verified={verified} {time.time()-t0:.1f}s', flush=True)
            if ok:
                passed += 1
        except Exception as e:  # noqa: BLE001
            print(f'[attempt {attempt}/{args.attempts}] ERR {type(e).__name__}: {str(e)[:110]}', flush=True)
        finally:
            try:
                driver.quit()
            except Exception:  # noqa: BLE001
                pass
    print(f'SCORE: {passed}/{args.attempts}')
    return 0


if __name__ == '__main__':
    sys.exit(main())

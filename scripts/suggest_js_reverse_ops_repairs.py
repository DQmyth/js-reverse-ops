#!/usr/bin/env python3
import json
import sys
from pathlib import Path


def usage():
    print("Usage: suggest_js_reverse_ops_repairs.py <dep-report.json> [--output <repairs.json>]", file=sys.stderr)
    sys.exit(1)


def add_repair(repairs, rid, severity, problem, action):
    repairs.append(
        {
            "id": rid,
            "severity": severity,
            "problem": problem,
            "recommended_action": action,
        }
    )


def main():
    args = sys.argv[1:]
    if not args:
        usage()

    input_path = args[0]
    output_path = ""
    i = 1
    while i < len(args):
        if args[i] == "--output":
            i += 1
            output_path = args[i] if i < len(args) else ""
        else:
            usage()
        i += 1

    report = json.loads(Path(input_path).read_text(encoding="utf-8"))
    repairs = []

    python_ok = report.get("python", {}).get("ok")
    node_ok = report.get("node", {}).get("ok")
    npm_ok = report.get("npm", {}).get("ok")
    rg_ok = report.get("commands", {}).get("rg", {}).get("installed")
    chrome_ok = report.get("browser_support", {}).get("google_chrome", {}).get("installed")
    open_ok = report.get("browser_support", {}).get("open", {}).get("installed")
    optional = report.get("optional_tools", {})
    tshark_ok = optional.get("tshark", {}).get("installed")
    mitmdump_ok = optional.get("mitmdump", {}).get("installed")
    wasm2wat_ok = optional.get("wasm2wat", {}).get("installed")
    wasm_decompile_ok = optional.get("wasm-decompile", {}).get("installed")
    jadx_ok = optional.get("jadx", {}).get("installed")
    frida_ok = optional.get("frida", {}).get("installed")

    if not python_ok:
      add_repair(repairs, "install-python3", "high", "python3 unavailable", "Install Python 3 and rerun the dependency check before using report or repair scripts.")
    if not node_ok:
      add_repair(repairs, "install-node", "high", "node unavailable", "Install Node.js because most js-reverse-ops extractors and scaffolds depend on it.")
    if node_ok and not npm_ok:
      add_repair(repairs, "install-npm", "medium", "npm unavailable", "Restore npm or a compatible package runner if static tooling or optional install flows are needed.")
    if not rg_ok:
      add_repair(repairs, "install-rg", "medium", "rg unavailable", "Install ripgrep to keep file triage and code search fast enough for large targets.")
    if not open_ok:
      add_repair(repairs, "missing-open", "high", "macOS open command unavailable", "Restore the platform launcher command or avoid browser-first flows on this host.")
    if not chrome_ok:
      add_repair(repairs, "chrome-not-found", "medium", "Google Chrome not found on PATH", "Use start_debug_browser.sh with a known-good Chrome app install or point the workflow at another healthy DevTools target.")
    if not tshark_ok:
      add_repair(repairs, "optional-tshark", "low", "tshark unavailable", "Install tshark if you want packet-capture-guided replay and pcap-driven credential recovery workflows.")
    if not mitmdump_ok:
      add_repair(repairs, "optional-mitmdump", "low", "mitmdump unavailable", "Install mitmproxy if proxy delivery and interception-backed replay handoff matter for this host.")
    if not wasm2wat_ok and not wasm_decompile_ok:
      add_repair(repairs, "optional-wasm-tooling", "low", "wasm text tooling unavailable", "Install wabt or a compatible wasm decompiler if wasm-heavy recover workflows are common.")
    if not jadx_ok:
      add_repair(repairs, "optional-jadx", "low", "jadx unavailable", "Install jadx if hybrid Android or APK-adjacent reverse samples are part of the benchmark corpus.")
    if not frida_ok:
      add_repair(repairs, "optional-frida", "low", "frida unavailable", "Install frida only if runtime mobile bridge or native-assisted workflows are part of the current target mix.")

    browser_scripts = report.get("browser_support", {})
    for key in ["start_debug_browser.sh", "check_debug_browser.sh", "check_local_js_reverse_mcp.py"]:
      item = browser_scripts.get(key, {})
      if not item.get("present"):
        add_repair(repairs, f"missing-{key}", "high", f"{key} missing", f"Restore {key} because browser-first runtime workflows depend on it.")

    mode = report.get("mode", "minimal")
    if mode == "full":
      add_repair(repairs, "no-repair-needed", "low", "core dependencies available", "No repair is required. Proceed to runtime or recover workflows.")

    result = {
        "source": str(Path(input_path).resolve()),
        "generated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "mode": mode,
        "repairs": repairs,
        "summary": {
            "high": len([r for r in repairs if r["severity"] == "high"]),
            "medium": len([r for r in repairs if r["severity"] == "medium"]),
            "low": len([r for r in repairs if r["severity"] == "low"]),
        },
    }

    payload = json.dumps(result, ensure_ascii=False, indent=2)
    if output_path:
        Path(output_path).write_text(payload + "\n", encoding="utf-8")
    print(payload)


if __name__ == "__main__":
    main()

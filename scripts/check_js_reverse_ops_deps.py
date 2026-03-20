#!/usr/bin/env python3
import json
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"


def which(name):
    path = shutil.which(name)
    return {"installed": bool(path), "path": path}


def run_version(cmd):
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10, check=False)
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    output = (result.stdout or result.stderr or "").strip().splitlines()
    return {
        "ok": result.returncode == 0,
        "returncode": result.returncode,
        "version": output[0] if output else "",
    }


def check_file(path):
    return {"present": path.exists(), "path": str(path)}


def main():
    report = {
        "skill": "js-reverse-ops",
        "python": run_version(["python3", "--version"]),
        "node": run_version(["node", "--version"]),
        "npm": run_version(["npm", "--version"]) if shutil.which("npm") else {"ok": False, "error": "npm not found"},
        "commands": {
            "rg": which("rg"),
            "git": which("git"),
            "curl": which("curl"),
        },
        "optional_tools": {
            "tshark": which("tshark"),
            "mitmdump": which("mitmdump"),
            "wasm2wat": which("wasm2wat"),
            "wasm-decompile": which("wasm-decompile"),
            "jadx": which("jadx"),
            "frida": which("frida"),
        },
        "browser_support": {
            "google_chrome": which("Google Chrome"),
            "open": which("open"),
            "start_debug_browser.sh": check_file(SCRIPTS / "start_debug_browser.sh"),
            "check_debug_browser.sh": check_file(SCRIPTS / "check_debug_browser.sh"),
            "check_local_js_reverse_mcp.py": check_file(SCRIPTS / "check_local_js_reverse_mcp.py"),
        },
        "core_artifacts": {
            "skill_md": check_file(ROOT / "SKILL.md"),
            "reverse_task_template": check_file(ROOT / "assets" / "reverse-task-template.json"),
            "output_contract": check_file(ROOT / "references" / "output-contract.md"),
        },
    }

    optional_coverage = {
        name: data["installed"]
        for name, data in report["optional_tools"].items()
    }
    report["optional_profiles"] = {
        "packet_capture": optional_coverage["tshark"],
        "proxy_delivery": optional_coverage["mitmdump"],
        "wasm_recover": optional_coverage["wasm2wat"] or optional_coverage["wasm-decompile"],
        "android_or_hybrid": optional_coverage["jadx"],
        "runtime_mobile_bridge": optional_coverage["frida"],
    }

    findings = []
    if not report["python"]["ok"]:
        findings.append("python3 unavailable")
    if not report["node"]["ok"]:
        findings.append("node unavailable")
    if not report["commands"]["rg"]["installed"]:
        findings.append("rg unavailable")
    if not report["browser_support"]["open"]["installed"]:
        findings.append("macOS open command unavailable")
    if not report["browser_support"]["start_debug_browser.sh"]["present"]:
        findings.append("start_debug_browser.sh missing")

    if not findings:
        report["mode"] = "full"
        report["summary"] = "Core local dependencies for js-reverse-ops are available."
    elif report["python"]["ok"] and report["node"]["ok"]:
        report["mode"] = "degraded"
        report["summary"] = "Core language runtimes are available, but some helper commands are missing."
    else:
        report["mode"] = "minimal"
        report["summary"] = "Only limited js-reverse-ops workflows are currently available."

    report["findings"] = findings
    json.dump(report, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()

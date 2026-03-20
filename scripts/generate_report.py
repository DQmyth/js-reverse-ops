#!/usr/bin/env python3
import json
import sys
from pathlib import Path


def section(title, body):
    return f"## {title}\n\n{body.strip()}\n"


def bullets(items):
    if not items:
        return '- none'
    return '\n'.join(f'- {item}' for item in items)


def main():
    if len(sys.argv) != 3:
        print('Usage: generate_report.py <evidence.json> <report.md>', file=sys.stderr)
        return 1

    evidence = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    report_path = Path(sys.argv[2])

    content = []
    content.append(f"# {evidence.get('title', 'JS Reverse Report')}\n")
    content.append(section('Target Context', bullets([
        f"task_type: {evidence.get('task_type', 'unknown')}",
        f"target_url: {evidence.get('target_url', 'unknown')}",
        f"target_action: {evidence.get('target_action', 'unknown')}",
    ])))
    content.append(section('Verified Findings', bullets(evidence.get('verified_findings', []))))
    content.append(section('Inferred Findings', bullets(evidence.get('inferred_findings', []))))
    content.append(section('Unknowns', bullets(evidence.get('unknowns', []))))
    content.append(section('Artifacts', bullets(evidence.get('artifacts', []))))
    content.append(section('Validation', bullets(evidence.get('validation', []))))

    report_path.write_text('\n'.join(content), encoding='utf-8')
    print(f'wrote {report_path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

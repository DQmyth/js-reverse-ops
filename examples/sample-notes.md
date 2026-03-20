# Sample Notes

## Local JS

```bash
bash scripts/triage_js.sh examples/sample-target.js
node scripts/extract_iocs.js examples/sample-target.js
node scripts/extract_request_contract.js examples/sample-target.js
```

Expected outcome:

- you see request-like route fragments
- you recover method and likely body keys

## HTML Page

```bash
node scripts/profile_page_family.js examples/sample-page.html
node scripts/extract_page_contract.js examples/sample-page.html
```

Expected outcome:

- you see an inline-page style classification
- you recover a simple `/api/demo/list` endpoint candidate

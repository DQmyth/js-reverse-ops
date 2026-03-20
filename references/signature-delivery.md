# Signature Delivery

This reference absorbs the strongest website-signature and Python-delivery guidance from older JS reverse-analysis skills.

## When To Use

Use this after runtime truth is captured and the target request contract is stable enough to rebuild.

Typical triggers:

- `sign`
- `token`
- `nonce`
- encrypted body
- cookie generation
- anti-crawler headers
- user asks for Python replay or ready-to-run request code

## Delivery Rule

Do not jump directly from source reading to Python code.

Preferred order:

1. capture live request
2. identify fields and upstream dependencies
3. classify each field as verified or inferred
4. define minimum browser assumptions
5. scaffold replay
6. compare replay output against runtime truth
7. only then hand off Python or proxy artifacts

## Minimum Report Shape

For site-signature tasks, the durable result should state:

- target URL and request URL
- request method
- field list and dependency list
- cookie dependencies
- signature or crypto dependency
- replay assumptions
- validation result
- remaining unknowns

## Minimum Python Shape

The Python delivery artifact should usually include:

- field builder functions
- cookie/bootstrap acquisition functions
- request function
- response parsing or JSONP parsing if needed
- a small executable example

Use existing assets and scripts when possible:

- [output-contract.md](/Users/liqiuhui/Desktop/code/zhipu/codex/skills/js-reverse-ops/references/output-contract.md)
- [proxy-rpc-integration.md](/Users/liqiuhui/Desktop/code/zhipu/codex/skills/js-reverse-ops/references/proxy-rpc-integration.md)
- `scripts/replay_scaffold.py`
- `scripts/scaffold_proxy_rpc_delivery.js`

## Anti-Crawler Checklist

Before claiming a replay is complete, check:

- cookies
- timestamp fields
- nonce fields
- header order or browser-only headers
- JSONP callback shape
- localStorage or sessionStorage inputs
- challenge-script bootstrap inputs
- server-issued literals that are only client-persisted

## Unification Rule

The old “analyze website JS and output Python” workflow is now a `Runtime -> Replay -> Delivery` slice inside `js-reverse-ops`, not a separate skill.

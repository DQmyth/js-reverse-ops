# MCP Server Portability

Use adapter-neutral workflow artifacts when a reverse task can be executed by more than one browser or JS reverse MCP server.

## Rule

Plan in normalized capabilities, execute through the active server, and ingest only observed results.

Do not let the selected MCP server decide evidence strength. A tool call can be:

- `planned`: emitted in a workflow plan but not run
- `executed`: run by a server but produced no useful target evidence
- `observed`: produced runtime, network, source, or debugger evidence
- `accepted`: tied to server acceptance or replay parity

## Adapter Map

Use `assets/mcp-server-adapter-map.json` to translate a workflow step into capability intent:

- browser navigation
- network interception
- runtime hooking
- debugger frames
- source recovery
- wasm runtime hints

When a server does not support a capability directly, record the blocker in the execution record instead of silently substituting weaker evidence.

## Execution Records

Every live MCP execution should preserve:

- server family or concrete server name
- tool name or adapter
- normalized action
- status
- observed outputs
- artifact paths
- blocker or error text if execution failed

Use `scripts/compare_mcp_execution_records.js` when comparing two server runs or checking whether a rerun preserved equivalent evidence.

## Promotion Boundary

MCP execution does not automatically promote a claim. Promotion still requires the normal evidence rules:

- source or static results remain `inferred`
- runtime hook outputs can become `observed`
- replay or server acceptance can become `accepted`
- divergent replay downgrades delivery readiness

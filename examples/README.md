# Examples

这些样例不是针对任何具体站点，而是给人和 AI 一个最小可复用输入输出参考。

## 包含内容

- `sample-target.js`：极简本地 JS 目标
- `sample-page.html`：极简 HTML 页面目标
- `sample-static-obfuscated.js`：极简静态恢复样例，用于 AST pipeline benchmark
- `sample-sourcemap-bundle.js`：带 `sourceMappingURL` 的极简 bundle，用于验证 source-map-first 静态规划
- `sample-browser-mcp-execution-record.json`：Chrome DevTools MCP 烟测执行记录校验样例
- `sample-playwright-mcp-execution-record.json`：Playwright MCP 烟测执行记录校验样例
- `sample-browser-tools-mcp-execution-record.json`：browser-tools MCP 烟测执行记录校验样例
- `sample-domain-handoff-record.json`：WASM 跨域 handoff 边界 artifact 校验样例
- `sample-packet-domain-handoff-record.json`：packet/protocol handoff 边界 artifact 校验样例
- `sample-mobile-domain-handoff-record.json`：mobile shell handoff 边界 artifact 校验样例
- `sample-native-domain-handoff-record.json`：native binary handoff 边界 artifact 校验样例
- `sample-debugger-domain-handoff-record.json`：debugger frame handoff 边界 artifact 校验样例
- `sample-proxy-rpc-domain-handoff-record.json`：proxy/RPC handoff 边界 artifact 校验样例
- `sample-replay-divergent-record.json`：accepted 但响应 shape 分支不对的 replay 诊断样例
- `sample-replay-transport-403-record.json`：脚本回放被 403 拒绝的 transport profile 诊断样例
- `sample-replay-crypto-mismatch-record.json`：签名或 token 输出不一致的 replay 诊断样例
- `sample-replay-ttl-expired-record.json`：TTL / timestamp 窗口过期的 replay 诊断样例
- `sample-notes.md`：推荐执行顺序和预期产物
- `mobile-shell-requests-client.py`：H5 壳页转 JSON API 的 `requests` 客户端模板
- `mobile-shell-scrapy-template.py`：同类目标的 Scrapy spider 模板

## 目标

让首次使用者快速理解：

- 本地 JS 任务从哪里开始
- HTML 页面任务从哪里开始
- 常见脚本的输出大概长什么样
- 从运行时恢复出的 H5 request wrapper 如何落到通用 Python / Scrapy 交付

# js-reverse-ops

`js-reverse-ops` 是一个面向 Codex 的高强度 JavaScript 逆向技能包，目标不是“读懂一点混淆代码”，而是把一个真实站点或前端目标，从页面探测、运行时取证、混淆剥离、签名恢复，一路推进到可复现的 Node / Python 回放交付。

> 面向真实浏览器目标的逆向工作流，强调运行时真相、证据落盘、可复跑交付。

## 项目摘要

- 定位真实请求，而不是停留在静态猜测
- 优先恢复字段来源，而不是只抄最终参数
- 产出可复核 artifact，而不是一次性聊天结论
- 支持从页面分析一路落到 Node / Python replay

## 和普通逆向笔记的区别

很多逆向资料停在“这段代码大概做了什么”或“这里能打出一个 sign”。`js-reverse-ops` 的目标更工程化：

- 不满足于描述逻辑，而是要求找到真实请求和真实字段来源
- 不满足于一次跑通，而是要求把结果沉淀成可复跑、可复核的产物
- 不把运行时和静态分析割裂开，而是明确分成 `Locate`、`Runtime`、`Recover`、`Replay`
- 不鼓励只保留零散笔记，而是尽量落成脚本、模板、证据目录和交付脚手架

## 使用场景

- 前端签名、动态 cookie、token、nonce、加密参数分析
- 依赖浏览器状态、首屏 bootstrap、事件链路的目标
- 压缩包、字符串表、VM 壳、模块图、wasm 混合体
- 需要把逆向结果整理成可维护工具链的团队场景

它适合这类任务：

- 接口 `sign`、`token`、`nonce`、加密参数、动态 cookie 无法直接静态看出来
- 页面依赖浏览器运行时、首屏 bootstrap、延迟加载、闭包状态、事件链路
- 代码是压缩包、VM 壳、字符串表、eval 包裹、模块图、wasm 混合体
- 你不只想“分析一下”，而是要拿到一套可验证、可复跑、可交付的结果

## 强项

- 运行时优先：先找真实请求、真实调用链、真实字段来源，而不是靠猜
- Hook 优先：优先用 hook、预注入、请求关联，少走低效断点翻帧
- 证据驱动：所有结论尽量落盘成 artifact，而不是停留在聊天结论
- 逆向全链路：覆盖 `Locate`、`Runtime`、`Recover`、`Replay` 四个阶段
- 交付导向：目标是产出可重放的脚本、证据包、风险摘要、回放脚手架
- 表现层还原：不只处理 transport 和 signer，也能处理响应进浏览器后的 DOM 筛选、样式干扰、可见层重排
- 动态字体解码：能处理 accepted 响应里临时下发的 `woff/ttf` 字体，把页面局部字形重新映射成数字或符号
- bootstrap token 链：不仅看最终 signer，也会还原首屏阶段性 digest、包装 cookie、最小 acceptance 合同和有效窗口
- 迭代脚本预热链：能识别“同一个接口先回脚本、执行后再回数据”的 live 演进，不会被过时的第二接口假设带偏
- server-time wasm signer：能处理“先拿服务端时间，再把 `page|t` 喂给 wasm 或模块 signer”的链路
- runtime digest patch：能识别函数名像标准 `SM3/MD5`、但浏览器实际跑的是改造版 digest 分支的目标，并把补丁收成最小本地 JS helper
- 运行时 bundle signer：能从大 bundle 里只抽最小 helper，本地重放自定义 `btoa`、`md5` 或桥接函数
- fresh-reload 阶梯挑战：能处理“首轮 signer 先验真，再把上一步结果当下一步 key” 的多阶段链路
- 同页多轮 signer：能处理“首轮可复现、后续轮次必须带着前轮状态回放” 的 stateful signer 链路
- H5 壳页 API 转向：能处理桌面页不稳、但移动端或 app 头能落到壳页，再从运行时路由和 request wrapper 反推出稳定 JSON API 的目标
- transport 分层：能区分是 signer 错，还是 HTTP/2 / 客户端画像这一层才是真正门槛
- verify/data 分流：能处理 verify 响应不可靠、但数据接口才是最终放行判据的 challenge 链
- 明面请求诱饵识别：能处理页面表面只有一个简单请求、但真实放行点在隐藏 token 合同里的目标
- 网格验证码匹配：能处理 `3x3` 一类小网格点击题，把 challenge 图拆成格子后做目标到格子的最小代价匹配

## 对标工具链

`js-reverse-ops` 不试图替代所有专用工具，而是把它们收进可验证的工作流里：

- 先找 source map、原始模块或真实运行时请求，避免把时间花在可绕过的混淆层
- 用 `webcrack` 处理常见 bundle、字符串表、obfuscator.io 和第一轮拆包
- 用 `wakaru` 做现代压缩输出的可读化和语法归一
- 用 `ast-grep`、Babel、`recast` 做小范围、可审计 AST 改写
- 只有在脱敏后，才考虑用 `humanify` 或其他 LLM 工具恢复变量名

这些工具只负责降低阅读成本。最终结论仍然要回到浏览器观测、字段来源、证据包和 replay 验证。

## 能做什么

- 定位真实业务请求、隐藏路由、签名字段、关键 cookie 来源
- 从浏览器运行时抓取请求参数、局部变量、调用栈、hook 证据
- 处理混淆包、字符串表、VM 调度器、模块加载链、wasm 邻接逻辑
- 生成 replay scaffold，把浏览器逻辑搬到 Node 或 Python
- 产出标准化证据目录，方便后续复核、交接和持续迭代

## 能力矩阵

| 方向 | 覆盖能力 |
| --- | --- |
| 请求恢复 | 接口定位、签名字段恢复、关键参数来源追踪 |
| 运行时取证 | hook 方案、预注入、调用栈、局部变量、请求关联 |
| 静态恢复 | 压缩包拆读、字符串表恢复、eval 剥离、VM 语义标注 |
| 混合目标 | 模块图、wasm 邻接逻辑、首屏 bootstrap、延迟加载 |
| 交付输出 | Node / Python 回放脚手架、证据目录、风险摘要、流程产物 |

## 典型工作流

### 1. 先找真实请求

- 本地 JS：`triage_js.sh -> extract_iocs.js -> extract_request_contract.js`
- HTML 页面：`profile_page_family.js -> extract_page_contract.js`
- 浏览器目标：先确认浏览器与 MCP 桥接健康，再抓运行时证据

### 2. 再确认字段来源

- 先判断字段是在静态代码里可见，还是只能在运行时产生
- 优先使用 hook、预注入和请求相关调用链，而不是一上来断点硬翻
- 对关键字段保留可复核的 artifact，而不是只保留口头结论
- 如果响应已经 accepted 但页面显示仍然难以解释，继续追页面端的 post-response 渲染代码，确认是否存在隐藏 class、可见层筛选、重排后的 DOM 顺序
- 如果响应里已经带了动态字体或字形实体，不要先猜 transport，先把当前页唯一字形集合和页级映射收出来

### 3. 最后产出可交付结果

- 需要阅读性：走 `Recover`
- 需要浏览器真相：走 `Runtime`
- 需要离线重放：走 `Replay`
- 需要阶段衔接和标准化目录：走 bundle / report / scaffold 输出

## 常用脚本速查

| 目的 | 脚本 |
| --- | --- |
| JS 初步分诊 | `scripts/triage_js.sh` |
| IOC 提取 | `scripts/extract_iocs.js` |
| 请求契约提取 | `scripts/extract_request_contract.js` |
| 页面家族识别 | `scripts/profile_page_family.js` |
| 页面契约提取 | `scripts/extract_page_contract.js` |
| AST 清洗管线 | `scripts/run_ast_pipeline.js` |
| 静态真值门禁 | `scripts/assess_static_recovery_truth.js` |
| 字符串表恢复 | `scripts/recover_string_table.js` |
| 模块图追踪 | `scripts/trace_module_graph.js` |
| Hook 方案脚手架 | `scripts/scaffold_hook_profile.js` |
| 反检测 profile 选择 | `scripts/select_anti_detection_profile.js` |
| Playbook 自动 runner | `scripts/run_playbook.js` |
| 交付产物校验 | `scripts/validate_delivery_artifacts.js` |
| 下一步动作推荐 | `scripts/recommend_next_action.js` |
| 能力评分报告 | `scripts/generate_capability_scorecard.js` |
| 市场差距评分 | `scripts/generate_market_gap_scorecard.js` |
| 外部矩阵对比 | `scripts/compare_external_skill_matrix.js` |
| Browser MCP 烟测计划 | `scripts/plan_browser_mcp_smoke.js` |
| Browser MCP 烟测记录校验 | `scripts/verify_browser_mcp_smoke_record.js` |
| Browser MCP 交付闭环 | `scripts/run_mcp_delivery_loop.js` |
| 跨域 handoff 校验 | `scripts/validate_domain_handoff_record.js` |
| Replay 失败诊断 | `scripts/diagnose_replay_failure.js` |
| Replay 客户端生成 | `scripts/generate_replay_delivery_client.js` |
| Replay 客户端校验 | `scripts/validate_replay_delivery_client.js` |
| 发布风险解释 | `scripts/explain_public_release_risk.js` |
| 单命令 CLI | `scripts/jsro.js` / `jsro` |
| 本地一键安装 | `scripts/install_local.sh` |
| 一键发布流程 | `scripts/publish_release.sh` |
| 公开版自检 | `scripts/check_public_release.sh` |

## 命令速查

```bash
# 本地 JS
node scripts/js_reverse_ops.js target.js
bash scripts/triage_js.sh target.js
node scripts/extract_iocs.js target.js
node scripts/extract_request_contract.js target.js

# HTML 页面
node scripts/js_reverse_ops.js page.html
node scripts/profile_page_family.js page.html
node scripts/extract_page_contract.js page.html

# 已有现象描述或失败日志
node scripts/map_case_to_pattern.js notes.md
node scripts/run_playbook.js target.js --notes notes.md --out runs/current
node scripts/validate_delivery_artifacts.js runs/current
node scripts/recommend_next_action.js runs/current

# 公开 benchmark
node scripts/run_public_benchmarks.js
node scripts/generate_capability_scorecard.js
node scripts/compare_external_skill_matrix.js --json
node scripts/select_anti_detection_profile.js --symptoms "navigator webdriver canvas webgl user-agent client hints differ" --json
node scripts/select_anti_detection_profile.js --symptoms "localStorage seed cookie write order bootstrap state" --json
node scripts/validate_domain_handoff_record.js --record examples/sample-domain-handoff-record.json --json --strict
node scripts/validate_domain_handoff_record.js --record examples/sample-packet-domain-handoff-record.json --json --strict
node scripts/validate_domain_handoff_record.js --record examples/sample-mobile-domain-handoff-record.json --json --strict
node scripts/validate_domain_handoff_record.js --record examples/sample-native-domain-handoff-record.json --json --strict
node scripts/validate_domain_handoff_record.js --record examples/sample-debugger-domain-handoff-record.json --json --strict
node scripts/validate_domain_handoff_record.js --record examples/sample-proxy-rpc-domain-handoff-record.json --json --strict
node scripts/plan_browser_mcp_smoke.js --server-family chrome_devtools_mcp --json
node scripts/verify_browser_mcp_smoke_record.js --record examples/sample-browser-mcp-execution-record.json --json
node scripts/verify_browser_mcp_smoke_record.js --record examples/sample-playwright-mcp-execution-record.json --server-family playwright_mcp --json
node scripts/verify_browser_mcp_smoke_record.js --record examples/sample-browser-tools-mcp-execution-record.json --server-family browser_tools_mcp --json
node scripts/run_mcp_delivery_loop.js examples/sample-target.js --notes "XMLHttpRequest.open rewrites URL global token missing" --out tmp/mcp-loop --record examples/sample-browser-mcp-execution-record.json --json
node scripts/recommend_next_action.js tmp/mcp-loop --json
node scripts/plan_static_toolchain.js examples/sample-sourcemap-bundle.js --json
node scripts/diagnose_replay_failure.js --replay-record examples/sample-replay-divergent-record.json --notes "accepted request but observed error shape" --json
node scripts/generate_replay_delivery_client.js --record examples/sample-replay-record.json --out tmp/replay-client --json
node scripts/validate_replay_delivery_client.js tmp/replay-client --json
node scripts/diagnose_replay_failure.js --replay-record examples/sample-replay-transport-403-record.json --notes "403 in script while browser succeeds; compare client profile" --json
node scripts/diagnose_replay_failure.js --replay-record examples/sample-replay-crypto-mismatch-record.json --notes "signature mismatch and token mismatch after request contract parity" --json
node scripts/diagnose_replay_failure.js --replay-record examples/sample-replay-ttl-expired-record.json --notes "ttl and timestamp expired; freeze server time before replay" --json
node scripts/assess_static_recovery_truth.js --original examples/sample-static-decoy.js --json
node scripts/assess_static_recovery_truth.js --original examples/sample-static-readable-wrong.js --runtime-evidence examples/sample-static-runtime-divergence.json --json
node scripts/explain_public_release_risk.js --json --strict
node scripts/jsro.js benchmark

# 本地安装
bash scripts/install_local.sh

# 发布检查 / 可选发布
bash scripts/publish_release.sh

# 公开仓库自检
bash scripts/check_public_release.sh
```

## 发布安全边界

公开仓库只应该包含通用脚本、脱敏样例、模板、playbook 和 reference。同步 GitHub 前必须确认：

- `tmp/`、`__pycache__/`、`.pyc`、本地 benchmark 输出没有被 git 跟踪
- 私有站点名、真实 cookie/token/session、客户路径、绝对用户目录没有进入公开内容
- LLM 重命名或云端工具处理过的代码已经脱敏，且只保留必要片段
- `node scripts/explain_public_release_risk.js --json --strict` 没有发现 tracked 高/中风险文件
- `bash scripts/check_public_release.sh` 已通过

## 快速上手

如果你的目标是一个本地 JS 文件：

```bash
node scripts/js_reverse_ops.js <target.js>
bash scripts/triage_js.sh <target.js>
node scripts/extract_iocs.js <target.js>
node scripts/extract_request_contract.js <target.js>
```

如果你已经有一段现象描述、hook 摘要或失败日志：

```bash
node scripts/map_case_to_pattern.js <notes.md>
node scripts/js_reverse_ops.js <target.js> --notes <notes.md>
node scripts/run_playbook.js <target.js> --notes <notes.md> --out runs/current
```

如果你的目标是一个下载下来的 HTML 页面：

```bash
node scripts/js_reverse_ops.js <page.html>
node scripts/profile_page_family.js <page.html>
node scripts/extract_page_contract.js <page.html>
```

如果你的目标依赖浏览器运行时：

```bash
python3 scripts/check_js_reverse_ops_deps.py
bash scripts/start_debug_browser.sh
bash scripts/check_debug_browser.sh
```

如果你想确认公开包的核心能力没有退化：

```bash
node scripts/run_public_benchmarks.js
node scripts/generate_capability_scorecard.js
node scripts/generate_market_gap_scorecard.js
bash scripts/check_public_release.sh
```

如果你想一键安装到 Codex skill 目录：

```bash
bash scripts/install_local.sh
```

如果你通过 npm 或本地 package bin 使用：

```bash
jsro route examples/sample-target.js
jsro run examples/sample-target.js --notes examples/sample-notes.md --out runs/current
jsro benchmark
```

如果你想走一键发布流程：

```bash
bash scripts/publish_release.sh
bash scripts/publish_release.sh --version 0.1.15 --message "Release v0.1.15" --tag --push
```

然后再根据 `SKILL.md` 和 `references/stages/` 里的分阶段路线，进入 `Locate`、`Runtime`、`Recover` 或 `Replay`。

## 推荐阅读顺序

如果你第一次接触这个仓库，建议按这个顺序看：

1. `README.md`
2. `SKILL.md`
3. `references/task-types.md`
4. `references/stages/locate.md`
5. `references/stages/runtime.md`
6. `references/stages/recover.md`
7. `references/stages/replay.md`
<!-- BEGIN PLAYBOOK_READ_ORDER -->
8. `playbooks/accepted-response-hidden-dom.md`（如果目标已经 accepted，但页面可见值仍然混乱）
9. `playbooks/embedded-runtime-font-mapping.md`（如果 accepted 响应通过字体字形来编码数字或符号）
10. `playbooks/bootstrap-digest-ladder.md`（如果目标依赖短生命周期 bootstrap token 链和包装 cookie）
11. `playbooks/iterative-script-warmup-same-endpoint.md`（如果同一接口先回脚本、执行后再回数据）
12. `playbooks/server-time-gated-wasm-signer.md`（如果 signer 依赖服务端时间和 wasm）
13. `playbooks/patched-runtime-digest-branch.md`（如果函数名看起来像标准哈希，但浏览器实际跑的是改造版 digest 分支）
14. `playbooks/runtime-bundle-signer-extraction.md`（如果只需要从大 bundle 里抽一个最小 runtime helper）
15. `playbooks/xhr-open-url-rewrite-runtime-replay.md`（如果最终签名不在全局变量里，而是在 XHR.open 阶段被注入 URL）
16. `playbooks/transport-profile-ladder.md`（如果同样的可见请求合同在不同客户端下命运不同）
17. `playbooks/lenient-verify-data-gate.md`（如果 verify 响应噪声很大，但数据接口才是真正放行口）
18. `playbooks/decoy-page-request-hidden-token-gate.md`（如果页面表面请求很简单，但真实放行还依赖一个隐藏 token 合同）
19. `playbooks/grid-challenge-template-matching.md`（如果 challenge 是固定小网格点击题）
20. `playbooks/fresh-reload-seeded-signer-step-key-ladder.md`（如果目标必须 fresh reload、首轮验真 signer、并把上一步结果当下一步 key）
21. `playbooks/same-page-prior-round-signer-replay.md`（如果首轮能过，但后续轮次必须按同页顺序回放前轮状态）
22. `playbooks/mobile-shell-api-pivot.md`（如果桌面页常触发校验，但移动端或 app 头能落到壳页并通过 JSON API 取数）
<!-- END PLAYBOOK_READ_ORDER -->

这样可以先建立总览，再进入阶段化执行细节。

## 新手路径

如果你是第一次真正用这套 skill 做任务，建议只走这一条最短路径：

1. 先拿一个本地 JS 或 HTML 目标做静态分诊
2. 跑 `extract_iocs.js`、`extract_request_contract.js` 或 `extract_page_contract.js`
3. 如果静态看不清，再进入浏览器运行时
4. 只在需要时再碰 AST 清洗、VM 语义恢复、回放脚手架

不要一开始就同时做 hook、断点、AST 清洗、环境补丁。先收紧目标，再升级工具。

## 仓库结构

- `SKILL.md`：技能入口、路由原则、执行规则
- `references/`：阶段文档、方法论、规则、策略说明
- `scripts/`：提取、归一化、取证、回放、报告生成脚本
- `assets/`：模板、预设、配置资产

## 公开质量门槛

公开包内置了 `assets/public-benchmark-cases.json` 和 `scripts/run_public_benchmarks.js`，用于验证：

- case pattern memory 能把通用现象映射到正确 playbook
- `js_reverse_ops.js --notes` 能按观察笔记改写路由
- `run_playbook.js` 能把 playbook 路由落成 run directory 和 hook scaffold
- `recommend_next_action.js` 能从 run directory 的 readiness、replay、risk 和 capture gap 中选出下一条最小命令
- `generate_replay_delivery_client.js` 能从 accepted replay record 生成脱敏 Node / Python replay 客户端模板
- `validate_replay_delivery_client.js` 能校验 replay client 的语法、manifest 安全边界和默认脱敏 base URL
- `explain_public_release_risk.js` 能解释 HAR/PCAP、token、绝对路径和生成目录等发布风险
- `compare_external_skill_matrix.js` 能把外部工具压力转成机器可读的能力矩阵和补强优先级
- `select_anti_detection_profile.js` 能把 navigator/TLS/client hint/storage/cookie 症状映射到最小 observation profile，且不把 profile 选择提升为 signer 或 replay 证明
- `plan_static_toolchain.js` 能优先识别 `sourceMappingURL`、inline source map、`sourceURL` 和 `X-SourceMap` 线索，先恢复原始源码再进入 AST 清洗
- `validate_domain_handoff_record.js` 能严格校验 WASM/packet/mobile/native/debugger handoff 是否保留了具体边界 artifact，且不会把跨域发现提升为 JS replay 证明
- `plan_browser_mcp_smoke.js` 和 `verify_browser_mcp_smoke_record.js` 能把 Chrome DevTools、Playwright、browser-tools 等不同 browser MCP server family 转成 planned/observed smoke checks，且不把未执行动作当作 observed evidence
- `assess_static_recovery_truth.js` 能防止可读静态恢复结果在没有 runtime/replay 证据时被提升为 verified behavior
- `diagnose_replay_failure.js` 能区分 accepted response-shape divergence、403 transport profile、crypto/token mismatch 和 TTL/time-window 过期
- 基础 HTML / JS 分诊路径仍然可用

`scripts/check_public_release.sh` 会自动执行这些 benchmark，并同时做敏感信息扫描和 release risk 审计。

## 自动 Runner

`scripts/run_playbook.js` 会把 router、pattern memory、playbook 和 hook presets 组合成一个可交接的运行目录：

- `playbook-run.json`：机器可读计划、命令、pattern 命中、执行结果
- `playbook-run.md`：人类可读 runbook
- `evidence.json`、`claim-set.json`、`risk-summary.json`：初始证据、声明强度和风险摘要
- `provenance-graph.json`、`provenance-summary.md`：字段和 cookie 来源的 bootstrap 图谱
- `operator-review.md`、`replay-status.json`：人工复核入口和 replay 状态
- `hook-profile.*`：如果命中 hook preset，会自动生成 hook 脚手架

默认是 dry-run，只写计划不执行目标脚本。需要执行本地静态脚本时显式加 `--execute`。

## 能力评分

`scripts/generate_capability_scorecard.js` 会从仓库证据和 benchmark 结果生成能力评分：

```bash
node scripts/generate_capability_scorecard.js --out tmp/scorecard.json --markdown tmp/scorecard.md
```

它不是替代真实逆向验证，而是给公开包一个稳定的自检视图：哪些能力有文件、脚本和 benchmark 支撑，哪些能力仍然只是弱项。

## 适合谁

- 想把前端逆向从“手工试错”升级成“流程化执行”的研究者
- 需要从浏览器行为里恢复请求构造逻辑的爬虫/自动化开发者
- 需要把一次逆向过程沉淀成可复核 artifact 的团队
- 需要把逆向结果交付成 Node / Python 回放能力的工程场景

## 公开版边界

这个公开仓库刻意去掉了以下内容：

- 私有测试样本和验证语料
- 具体站点 case 笔记和回放笔记
- 命名目标站点的 benchmark 素材
- 凭据形态示例、live capture 原始数据、敏感测试信息
- 从具名目标恢复出的 app key、生产 signer secret、完整 live signed URL

保留下来的是方法、流程、脚本和通用化能力，不是私有语料库。

## 重新导出公开版

如果你在私有工作区持续迭代，可以通过下面的命令重新生成一份公开导出版：

```bash
node skills/js-reverse-ops/scripts/refresh_public_release.js
node skills/js-reverse-ops/scripts/export_public_skill.js
```

输出目录：

```text
dist/public-skills/js-reverse-ops
```

## 发布

最短发布流程见 `PUBLISHING.md`。

## 相关文档

- `AGENTS.md`：给 AI / coding agent 的仓库级导航
- `AI_USAGE.md`：最短任务入口和使用约定
- `repo-map.json`：机器可读的仓库结构清单
- `references/scripts-catalog.md`：私有脚本目录索引与公开导出状态概览
<!-- BEGIN PLAYBOOK_RELATED_DOCS -->
- `playbooks/accepted-response-hidden-dom.md`：响应已 accepted 但页面仍有隐藏层、重排、表现层噪声时的专用手册
- `playbooks/embedded-runtime-font-mapping.md`：accepted 响应通过每页临时字体映射来隐藏数字或符号时的专用手册
- `playbooks/bootstrap-digest-ladder.md`：首屏阶段性 digest 链、包装 cookie、短 TTL acceptance 合同的专用手册
- `playbooks/iterative-script-warmup-same-endpoint.md`：同一个接口先返回脚本、再返回数据时的专用手册
- `playbooks/server-time-gated-wasm-signer.md`：signer 依赖服务端时间和 wasm/module helper 时的专用手册
- `playbooks/patched-runtime-digest-branch.md`：函数名像标准哈希、但浏览器实际跑的是改造版 digest 分支时的专用手册
- `playbooks/runtime-bundle-signer-extraction.md`：从大 bundle 里抽出最小 runtime signer helper 的专用手册
- `playbooks/xhr-open-url-rewrite-runtime-replay.md`：签名字段由运行时 transport hook 在 XMLHttpRequest.open 阶段注入 URL 时的专用手册
- `playbooks/transport-profile-ladder.md`：同样的可见合同在不同 HTTP 客户端下表现不同时的专用手册
- `playbooks/lenient-verify-data-gate.md`：challenge/verify/data 三段链里 verify 并非最终放行口时的专用手册
- `playbooks/decoy-page-request-hidden-token-gate.md`：页面表面请求是诱饵、真实放行在隐藏 token 合同时的专用手册
- `playbooks/grid-challenge-template-matching.md`：固定小网格点击题的自动化匹配与提交手册
- `playbooks/fresh-reload-seeded-signer-step-key-ladder.md`：fresh reload 首轮 signer 验真、URL|ts 一类 seed、以及逐步把上一阶段结果当 key 的专用手册
- `playbooks/same-page-prior-round-signer-replay.md`：首轮能过，但后续轮次必须按同页顺序回放前轮状态时的专用手册
- `playbooks/mobile-shell-api-pivot.md`：桌面页不稳、但 H5 / app 壳页能稳定落到 JSON API 时的专用手册
<!-- END PLAYBOOK_RELATED_DOCS -->
- `examples/`：最小无敏感样例输入，包含通用 `requests` / Scrapy 交付模板
- `CONTRIBUTING.md`：贡献约定
- `SECURITY.md`：边界与安全说明
- `CHECKLIST.md`：发布前自检清单
- `CHANGELOG.md`：公开仓库迭代记录
- `RELEASE.md`：版本策略与 tag 流程
- `VERSION`：当前公开版版本号
- `LICENSE`：开源许可证

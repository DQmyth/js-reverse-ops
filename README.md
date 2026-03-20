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
| 字符串表恢复 | `scripts/recover_string_table.js` |
| 模块图追踪 | `scripts/trace_module_graph.js` |
| Hook 方案脚手架 | `scripts/scaffold_hook_profile.js` |
| 公开版自检 | `scripts/check_public_release.sh` |

## 命令速查

```bash
# 本地 JS
bash scripts/triage_js.sh target.js
node scripts/extract_iocs.js target.js
node scripts/extract_request_contract.js target.js

# HTML 页面
node scripts/profile_page_family.js page.html
node scripts/extract_page_contract.js page.html

# 公开仓库自检
bash scripts/check_public_release.sh
```

## 快速上手

如果你的目标是一个本地 JS 文件：

```bash
bash scripts/triage_js.sh <target.js>
node scripts/extract_iocs.js <target.js>
node scripts/extract_request_contract.js <target.js>
```

如果你的目标是一个下载下来的 HTML 页面：

```bash
node scripts/profile_page_family.js <page.html>
node scripts/extract_page_contract.js <page.html>
```

如果你的目标依赖浏览器运行时：

```bash
python3 scripts/check_js_reverse_ops_deps.py
bash scripts/start_debug_browser.sh
bash scripts/check_debug_browser.sh
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

保留下来的是方法、流程、脚本和通用化能力，不是私有语料库。

## 重新导出公开版

如果你在私有工作区持续迭代，可以通过下面的命令重新生成一份公开导出版：

```bash
node skills/js-reverse-ops/scripts/export_public_skill.js
```

输出目录：

```text
dist/public-skills/js-reverse-ops
```

## 发布

最短发布流程见 `PUBLISHING.md`。

## 相关文档

- `CONTRIBUTING.md`：贡献约定
- `SECURITY.md`：边界与安全说明
- `CHECKLIST.md`：发布前自检清单
- `CHANGELOG.md`：公开仓库迭代记录
- `RELEASE.md`：版本策略与 tag 流程
- `VERSION`：当前公开版版本号
- `LICENSE`：开源许可证

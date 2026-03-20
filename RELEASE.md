# Release Guide

## 版本策略

当前公开仓库使用简单的三段版本号：

- `MAJOR`：公开接口、仓库结构、发布边界发生明显不兼容变化
- `MINOR`：新增能力、文档体系、检查流程、协作模板
- `PATCH`：小修复、表述修正、非破坏性脚本调整

当前首个公开版本：

```text
0.1.0
```

## 推荐发布步骤

先在私有工作区重新导出：

```bash
node skills/js-reverse-ops/scripts/export_public_skill.js
```

再在公开仓库目录执行：

```bash
cd dist/public-skills/js-reverse-ops
bash scripts/check_public_release.sh
```

更新版本与变更记录：

```bash
vi VERSION
vi CHANGELOG.md
```

提交并推送：

```bash
git add .
git commit -m "Release vX.Y.Z"
git push
```

最后打 tag：

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

## Tag 约定

- 使用 `v` 前缀，例如 `v0.1.0`
- tag 名称和 `VERSION` 文件保持一致
- 每个 tag 对应一条明确的 `CHANGELOG.md` 记录

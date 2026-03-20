# 发布说明

这个仓库应该从公开导出目录发布，而不是直接从私有工作区发布。

## 日常更新流程

先在私有工作区根目录重新导出：

```bash
node skills/js-reverse-ops/scripts/export_public_skill.js
```

再进入公开仓库：

```bash
cd dist/public-skills/js-reverse-ops
git status
vi VERSION
vi CHANGELOG.md
git add .
git commit -m "..."
git push
```

## 首次发布

如果你使用 GitHub CLI：

```bash
gh repo create js-reverse-ops --public --source=. --remote=origin --push
```

如果你使用已有远端：

```bash
git remote add origin <your-repo-url>
git branch -M main
git push -u origin main
```

## 安全检查

- 每次发布前都先重新运行公开导出命令
- 建议在公开仓库目录执行 `bash scripts/check_public_release.sh`
- 如果这次是一个正式发布点，先更新 `VERSION`
- 建议在提交前同步更新 `CHANGELOG.md`
- 确认公开仓库里没有新增私有样本、live capture、凭据形态信息
- 公开导出器现在会保留 `.git`，不会重建仓库元数据

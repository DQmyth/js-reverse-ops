# 发布前检查

每次准备推送公开仓库前，至少检查这几项：

- 已从私有工作区重新运行公开导出
- `git status` 只包含预期改动
- 没有把私有样本、测试站点、live capture、凭据形态信息带进来
- `README.md`、`CONTRIBUTING.md`、`SECURITY.md`、`LICENSE` 保持一致
- `CHANGELOG.md` 已记录本次公开仓库变更
- `VERSION` 在需要发布新版本时已同步更新
- `RELEASE.md` 与本次版本/tag 约定保持一致
- `AGENTS.md`、`AI_USAGE.md`、`repo-map.json` 与当前仓库结构保持一致
- 关键脚本没有因为公开裁剪而失效

## 建议命令

```bash
bash scripts/check_public_release.sh
git status
git diff --stat
```

如果仓库启用了 GitHub Actions，推送和 PR 也会自动执行同一套公开版检查。

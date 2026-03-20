# Publishing

This package is intended to be published from the exported directory, not from the private workspace copy.

## Recommended Flow

```bash
cd dist/public-skills/js-reverse-ops
git init
git add .
git commit -m "Initial public release of js-reverse-ops"
```

If you use GitHub CLI:

```bash
gh repo create js-reverse-ops --public --source=. --remote=origin --push
```

If you use an existing remote:

```bash
git remote add origin <your-repo-url>
git branch -M main
git push -u origin main
```

## Safety Check

Before pushing, rerun the private workspace export command so the package is rebuilt from the latest sanitized templates and leak scan.

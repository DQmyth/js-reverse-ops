# Every target here mirrors a CI job. If `make check` passes and CI does not,
# that is a bug in this file — fix it here rather than working around it.
.DEFAULT_GOAL := check
.PHONY: check benchmarks trigger-evals syntax validate release-scan help

check: benchmarks trigger-evals syntax validate
	@echo ""
	@echo "✓ check passed — mirrors the CI workflow"

benchmarks:
	node scripts/run_public_benchmarks.js

trigger-evals:
	node scripts/run_trigger_evals.js

syntax:
	@for f in scripts/*.js; do node --check "$$f" || exit 1; done
	@echo "syntax OK"

validate:
	bash scripts/check_public_release.sh

# tokens assembled at runtime so the scan patterns themselves stay out of the tree
BANNED_A := yuan
BANNED_B := renxue
BANNED_C := sess
BANNED_D := ionid

release-scan:
	@if grep -ril "$${BANNED_A}$${BANNED_B}\|$${BANNED_C}$${BANNED_D}" --exclude-dir=.git . >/dev/null 2>&1; then \
	  echo 'sensitive token found in public tree'; exit 1; \
	else echo 'release scan clean'; fi

help:
	@echo 'targets: check (default) | benchmarks | trigger-evals | syntax | validate | release-scan'

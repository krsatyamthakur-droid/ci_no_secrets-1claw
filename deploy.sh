#!/usr/bin/env bash
set -euo pipefail

# Mock deploy. The real deploy credential arrives as $DEPLOY_KEY, injected by the
# 1Claw GitHub Action from the vault. It is masked in logs. We never echo its value.

if [ -z "${DEPLOY_KEY:-}" ]; then
  echo "✖ DEPLOY_KEY is not set — 1Claw did not inject the secret."
  exit 1
fi

echo "✓ Deploy credential received from the 1Claw vault"
echo "  (length: ${#DEPLOY_KEY} chars, value masked — never printed, never in the repo)"
echo "→ Deploying to staging…"
sleep 1
echo "✓ Deploy complete."
echo
echo "No deploy secret lives in the repo or in GitHub Secrets —"
echo "only the low-privilege 1Claw agent key does, and it just reads the vault."

#!/usr/bin/env bash
# Commit regenerated data and push, retrying on concurrent updates. Usage: commit.sh "message"
set -euo pipefail
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A data services.json incidents events sitemap.xml robots.txt blocks.json llms.txt llms-full.txt || true
git add -A -- '*.html' || true
if git diff --cached --quiet; then echo "no changes"; exit 0; fi
git commit -q -m "$1"
for i in 1 2 3 4 5; do
  if git push -q origin HEAD:main; then echo "pushed"; exit 0; fi
  echo "push rejected, rebasing (attempt $i)"; sleep $((i * 5))
  git pull -q --rebase -X theirs origin main
done
exit 1

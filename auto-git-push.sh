#!/usr/bin/env bash

set -u

REPO_DIR="/home/opc/manga-web"
BRANCH="develop"
REMOTE="origin"
LOG_FILE="$REPO_DIR/.git/auto-push.log"
LOCK_FILE="/tmp/manga-web-auto-push.lock"

mkdir -p "$(dirname "$LOG_FILE")"
exec >>"$LOG_FILE" 2>&1

echo "[$(TZ=Asia/Tokyo date '+%Y-%m-%d %H:%M:%S JST')] Auto push started"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another auto-push process is already running."
  exit 0
fi

cd "$REPO_DIR" || exit 1

if [[ -e .git/MERGE_HEAD || -d .git/rebase-merge || -d .git/rebase-apply ]]; then
  echo "Skipped because a merge or rebase is in progress."
  exit 1
fi

current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "$BRANCH" ]]; then
  echo "Skipped: expected branch '$BRANCH', found '$current_branch'."
  exit 1
fi

git add --all

if ! git diff --cached --quiet; then
  commit_time="$(TZ=Asia/Tokyo date '+%Y-%m-%d %H:%M JST')"
  git commit -m "chore: automatic backup $commit_time" || exit 1
else
  echo "No new file changes to commit."
fi

GIT_SSH_COMMAND="ssh -o BatchMode=yes" git push "$REMOTE" "$BRANCH"
status=$?

if [[ $status -eq 0 ]]; then
  echo "Push completed successfully."
else
  echo "Push failed with exit code $status."
fi

echo "[$(TZ=Asia/Tokyo date '+%Y-%m-%d %H:%M:%S JST')] Auto push finished"
exit "$status"

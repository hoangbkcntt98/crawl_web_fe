#!/usr/bin/env bash

set -u

# Auto backup/push all code repositories for this manga project.
#
# The project is split across code repositories such as:
# - /home/opc/manga-web: Next.js app, API routes, DB migrations, UI
# - /home/opc/manga-crawler: generic crawler runtime and site config files
#
# /home/opc/manga-storage is intentionally not included because it stores
# downloaded manga images and can become very large. The script discovers
# /home/opc/manga-* folders but only pushes folders that are git repositories.

REPO_GLOB="/home/opc/manga-*"
BRANCH="develop"
REMOTE="origin"
LOG_FILE="/home/opc/manga-web/.git/auto-push.log"
LOCK_FILE="/tmp/manga-auto-push.lock"

mkdir -p "$(dirname "$LOG_FILE")"
exec >>"$LOG_FILE" 2>&1

echo "[$(TZ=Asia/Tokyo date '+%Y-%m-%d %H:%M:%S JST')] Auto push started"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another auto-push process is already running."
  exit 0
fi

overall_status=0
REPO_DIRS=()

for candidate in $REPO_GLOB; do
  if [[ -d "$candidate/.git" ]]; then
    REPO_DIRS+=("$candidate")
  else
    echo "Skipped non-git folder: $candidate"
  fi
done

if [[ ${#REPO_DIRS[@]} -eq 0 ]]; then
  echo "No git repositories matched $REPO_GLOB."
  exit 0
fi

push_repo() {
  local repo_dir="$1"
  local repo_name
  repo_name="$(basename "$repo_dir")"

  echo "--- $repo_name: checking $repo_dir ---"

  if [[ ! -d "$repo_dir/.git" ]]; then
    echo "$repo_name: skipped because it is not a git repository."
    return 0
  fi

  cd "$repo_dir" || return 1

  # Do not commit while git is in the middle of conflict-sensitive operations.
  if [[ -e .git/MERGE_HEAD || -d .git/rebase-merge || -d .git/rebase-apply ]]; then
    echo "$repo_name: skipped because a merge or rebase is in progress."
    return 1
  fi

  local current_branch
  current_branch="$(git branch --show-current)"
  if [[ "$current_branch" != "$BRANCH" ]]; then
    echo "$repo_name: skipped; expected branch '$BRANCH', found '$current_branch'."
    return 1
  fi

  # Stage all tracked, modified, deleted and new files inside this repository.
  git add --all

  if ! git diff --cached --quiet; then
    local commit_time
    commit_time="$(TZ=Asia/Tokyo date '+%Y-%m-%d %H:%M JST')"
    git commit -m "chore: automatic backup $repo_name $commit_time" || return 1
  else
    echo "$repo_name: no new file changes to commit."
  fi

  # BatchMode avoids hanging forever if SSH credentials are not available.
  GIT_SSH_COMMAND="ssh -o BatchMode=yes" git push "$REMOTE" "$BRANCH"
}

for repo_dir in "${REPO_DIRS[@]}"; do
  if push_repo "$repo_dir"; then
    echo "$(basename "$repo_dir"): push completed successfully."
  else
    status=$?
    overall_status=$status
    echo "$(basename "$repo_dir"): push failed with exit code $status."
  fi
done

if [[ $overall_status -eq 0 ]]; then
  echo "All configured repositories were pushed successfully."
else
  echo "One or more repositories failed to push."
fi

echo "[$(TZ=Asia/Tokyo date '+%Y-%m-%d %H:%M:%S JST')] Auto push finished"
exit "$overall_status"

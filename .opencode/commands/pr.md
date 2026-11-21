---
description:
  Commit changes, push branch, open a PR, and clean up the branch after merge
---

Review the current git status and diff to prepare a pull request. Additional
context: **$ARGUMENTS**

Follow these exact steps:

1. Verify we are NOT on `main` or `master`. If we are on the default branch,
   create and switch to a descriptive `feat/` or `fix/` branch first.
2. Stage all changes (`git add -A`) and commit them with a clear conventional
   commit message summarizing the work.
3. Push the feature branch to the remote repository (`git push -u origin HEAD`).
4. Create a pull request using `gh pr create --fill` (or write a clear title and
   summary body if more detail is needed) and display the PR URL.
5. **Wait for merge confirmation before deleting:** Ask me if I want to merge
   the PR now or wait until I merge it on GitHub.
6. Once the PR is confirmed merged:
   - Switch back to the default branch (`main` or `master`) and run `git pull`.
   - Delete the local feature branch safely with `git branch -d <branch-name>`.
   - Delete the remote branch if it still exists
     (`git push origin --delete <branch-name>`) and run `git fetch --prune`.
   - Confirm that the workspace is clean and back on the updated default branch.

---
description:
  Stage all modified and new files, commit directly to the current branch with a
  generated conventional commit message, and push to remote
---

Review the current git status and diff to commit and push all changes directly
to the current branch. Additional context: **$ARGUMENTS**

Follow these exact steps:

1. Check `git status` and `git diff` to understand all modified and
   new/untracked files.
2. Stage all changes, including all newly created (untracked) files, using
   `git add -A`.
3. Inspect the staged diff (`git diff --cached`) and generate a concise,
   descriptive conventional commit message (`feat:`, `fix:`, `chore:`,
   `refactor:`, `docs:`, etc.) based on the changes implemented (incorporating
   `$ARGUMENTS` if provided).
4. Commit the staged changes directly to the current branch with
   `git commit -m "<message>"`.
5. Push the current branch to the remote repository (`git push`).
6. Confirm `git status` is clean and report the commit hash, commit message, and
   pushed branch.

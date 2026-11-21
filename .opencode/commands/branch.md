---
description: Sync main and create a clean feature branch for a new task
---

Prepare a clean feature branch for the following task: **$ARGUMENTS**

Follow these exact steps:

1. Check `git status` to see if there are uncommitted changes. If there are
   uncommitted changes, stop immediately and ask me whether I want to stash them
   or commit them first.
2. Identify the repository's default branch (`main` or `master`), switch to it,
   and run `git pull` to get the latest remote changes.
3. Generate a short, lowercase, kebab-case branch name based on the task
   description above, prefixed with `feat/` (or `fix/` if the task is clearly a
   bug fix).
4. Create and switch to the new branch using `git checkout -b <branch-name>`.
5. Confirm the new branch name is checked out and ask me for instructions to
   begin the task.

# Git synchronization

The project panel keeps ordinary sends and updates separate from advanced
synchronization. Open **Git actions → Advanced synchronization** to compare
destinations, choose an integration strategy, or resume a paused operation.

## Favorite repository and branch exceptions

Open **Git actions → Git repositories** and use the star to select the usual
repository. Expand **Advanced branch options** to select another repository for
the currently displayed branch. Selecting **Use the favorite repository** removes
that local exception.

Preferences belong to the Git repository in its execution source. A WSL checkout
uses its WSL Git configuration; a host checkout uses its own configuration.
Linked worktrees share the repository's defaults, with exceptions keyed by branch.
No user-wide configuration is rewritten.

The settings use native Git configuration:

- `remote.pushDefault` stores the favorite repository.
- `branch.<name>.pushRemote` stores a branch exception.
- An existing associated branch retains its remote branch name when the selected
  destination matches its upstream repository. Otherwise the local branch name
  is suggested. The advanced dialog permits a different destination branch.

Before a favorite is explicitly saved, existing branch-specific Git configuration
is respected. Otherwise `origin`, or the first available repository, supplies the
initial default. A configured destination that no longer exists requires a new
selection; it never causes a silent send elsewhere.

Git itself uses the publication settings for sending. OpenCodexUI also uses the
chosen destination for its simple update action. Command-line `git pull` continues
to use the branch's upstream, which is changed only when explicitly requested in
advanced synchronization or established by publishing a new branch.

Tags use the repository favorite rather than a branch-specific exception.

## Simple actions

- **Send** publishes committed work to the usual destination. Staged and unstaged
  drafts remain local. It does not integrate remote changes or force an update.
- **Receive** updates the local branch only when a fast-forward is possible. It
  never sends local commits, creates a merge commit, or starts a rebase.
- If the remote has advanced or both histories need integration, the panel offers
  **Advanced synchronization**. Opening that dialog does not authorize execution.
- Connection and authentication failures keep their diagnostic output behind
  **Technical details**.

The visible counts describe the selected destination's locally known references.
Each exchange checks the actual publication endpoint again before modifying
history or sending commits. The existing source/worktree serialization and
destination revalidation also apply to simple actions.

## Vocabulary

The existing **Versioning vocabulary** setting applies to menus, ordinary exchange,
and the advanced dialog. Simple labels use **Replay** and **Combine**; technical
labels use **Rebase** and **Merge**. Tooltips explain both operations in either
vocabulary. Selecting a vocabulary does not change Git behavior.

# Chats outside projects

The speech-bubble tab beside Home contains personal conversations for tasks
that do not belong to a project. It stays separate from project tabs, the Home
project catalogue, and the workspace inventory.

## Starting a discussion

Select the source for new conversations, then choose **New chat**. The initial
conversation is an in-memory draft. Its native Codex thread and working
directory are created when the first message is sent. Ordinary unsent drafts
do not survive application shutdown. An interrupted
setup remains listed after restarting, with its source and recovery actions;
its unsent text remains an in-memory draft.

Each conversation keeps its source. Choosing another source in the sidebar
only affects future conversations. Rows display their source and model;
the ordinary composer and running-model indicator remain available.

The working directory belongs to the source filesystem:

```text
<CODEX_HOME>/opencodex-ui/discussions/<conversation-draft-uuid>
```

Paths are derived from the source's reported Codex home, rather than the
Electron host's home. This also applies to Windows, WSL, and remote sources.
No directory is created under Documents by OpenCodexUI.

## Files and permissions

Personal conversations reuse the ordinary chat, attachments, message viewers,
file explorer, and central document tabs. Generated files inside their working
directory open through the existing readers, including images, audio, and HTML.
Context folders and command permissions belong to this conversation's context.
They become available after its working directory has been allocated.

The source's normal Codex permission defaults apply. Starting a personal chat
does not grant full filesystem or network access. Existing per-chat Codex and
browser permission dialogs remain accessible from the conversation menu.

Git, Docker Compose, project commands, and workspace switching are omitted
from this view. Opening the collection does not scan project repositories or
start every configured source. It reads cached metadata on demand; opening a
conversation uses the ordinary source synchronization.

## History and recovery

Search, rename, refresh, archive, restore, deletion, and sub-agent history use
the shared conversation actions. Notifications open the personal tab. Source
and model events continue to reach a chat while another tab is selected.
Cached conversations remain readable if their source is removed.

Deleting a conversation does not delete its generated files. Its working
directory is retained, like ordinary source files referenced by a chat.

If native creation is interrupted, the draft and its text are retained. A
retry uses the same draft token. It may recover a single native conversation
only after verifying its source, exact working directory, and idle status.
Ambiguous or active executions retain their durable guards; no message or
creation request is silently replayed.

Interrupted setup appears with a warning icon. **Verify chat creation** finishes
identity allocation without sending a message. **Abandon setup** cancels only
the local allocation request after confirmation. It releases unbound setup
reservations, while keeping all source files and any native conversation.
Confirmed or deleted native identities cannot be silently recreated by retrying
an old draft token.

## Persistence and compatibility

Discussion environments are explicitly classified in SQLite. The internal
execution context reuses the project/workspace persistence machinery for
source ownership, file grants, execution reservations, and recovery. These
contexts are excluded from project lists, project tree items, and source
project counts. They are not identified by path heuristics or hidden-project
preferences.

Schema migration 56 preserves existing projects and their associations. Native
thread indexing preserves the classification through subsequent source syncs.

Automatic import of personal chats created by the official Codex application
is not included. An arbitrary cwd under Documents, or a folder without Git,
is not sufficient evidence that a conversation is outside a project.

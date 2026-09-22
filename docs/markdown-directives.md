# Codex presentation directives

Some assistant replies contain presentation hints inside `agentMessage.text`.
The [app-server documentation](https://learn.chatgpt.com/docs/app-server)
describes the text transport, but no public specification for the two directives
below was found when adding this compatibility layer. Treat them as observed
syntax, not a stable RPC contract.

## Supported hints

- `:codex-followup[Label]{prompt="Suggested next message"}` renders a button.
  Clicking queues text for the current chat's rich-text composer. It appends to
  existing content, preserves references and attachments, and never sends a turn.
  Suggestions are disabled while submission is awaiting acknowledgement.
- `:codex-file-citation[Label]{path="/project/report.xlsx" purpose="output"}`
  renders a file link through the existing source/workspace-aware link handler.
  Existing modifier-click and file-opening preferences still apply.
- Unlabelled citations accept `{path="..."}` and the observed attribute-only
  `[path="..." purpose="output"}` variant. The filename becomes the label.

Attributes must be quoted. Paths are filesystem references, not executable or
web URL schemes. Unknown attributes do not trigger actions. The `purpose`
attribute currently has no effect on opening behavior.

## Rendering boundaries

`remarkCodexDirectives` transforms complete hints within ordinary Markdown text
nodes. Code blocks, inline code and existing links are excluded. Unknown,
incomplete or unsupported forms retain their ordinary Markdown rendering. Hints
split across Markdown formatting nodes are not currently interpreted.

The transform creates escaped text and controlled React elements; it does not
parse raw HTML or evaluate attributes. Rendering caches only immutable trees.
Contexts resolve file actions and the current composer when those trees mount,
preventing cached suggestions from retaining another chat's draft target.

The original message remains unchanged for persistence, copying and plain-text
views. Tests cover observed forms, quoted values, Windows paths, code examples,
unsafe schemes, cached submitting state and composer suggestion queuing.

# Workspace files

The Files tool owns the explorer on the right. The central chat/file selection
is independent of that tool. Opening a different tool does not close a document.
Documents are retained in memory until individually closed or their project is
closed. They are not persisted across application restarts.

The Home settings page selects whether file links in chats and Git open in the
integrated editor (default) or the source's external application. Routing uses
the originating project, source and conversation workspace, including line and
column hints. Web URLs and paths outside that workspace retain the external
opener. Explorer clicks and explicit external-open actions keep their respective
intent regardless of this preference. The setting is persisted in
`settings.json` as `fileOpeningMode`.

Folder links have a separate `folderOpeningMode`: the source folder command
(default), or the host file manager. A bounded source-side stat distinguishes
folders from files before integrated navigation; it does not scan directories.
The host asynchronously checks host-accessible paths, including links outside a
workspace, before choosing the folder command or file manager. Remote paths are
never inspected on the host without an explicit local-access capability. Source
folder commands receive the clicked directory as `%D`, not the workspace root.
Explicit IDE/file-manager actions in the project menu bypass these preferences.

## Responsibilities

- `WorkspaceFilesService` validates persisted workspace ownership and the exact
  source/project/workspace/root supplied by the document. No active UI selection
  or default source participates in an operation.
- `fileWorkerScript` implements bounded filesystem operations. Local sources use
  a Node worker provided by Electron. WSL, SSH and custom sources execute the same
  helper through the source app-server's `process/spawn` and `process/writeStdin`
  APIs. These sources need Node.js on their PATH. No LLM request is made.
- `WorkspaceTreeStore` loads direct children on expansion and retains expansion
  per immutable workspace context. Refresh invalidates older responses.
- `ProjectFilesStore` owns documents and central navigation. `FileDocument`
  retains text, format, revision, errors and source positions independently of
  any mounted viewer. Document identity includes source, project, workspace,
  workspace root and relative path.
- `MonacoFileEditor` owns the visible editor. Models live until document disposal,
  preserving undo history across chat, document and project navigation. Editor
  view state is retained by the document. The chat remains mounted and laid out
  when hidden, preserving its composer and scroll position.
- `FileCloseStore` provides save/discard/cancel for document close, disk reload,
  project close, application close and updater restart. Failed saves leave the
  confirmation open and retain every edit.

## Filesystem guarantees and limits

The initial limit is 2 MiB per text file and 10,000 direct children per folder.
The explorer initially renders 200 entries and exposes additional batches on
request. It includes dotfiles and untracked files and never recursively scans a
workspace when opened. Internal symbolic links can be followed; cycles and
broken links remain visible but blocked. External links expose target metadata
without reading directory contents. Their context menu offers workspace-scoped
blocked, read-only and read/write access. Special files are not opened.

External grants are stored in `settings.json` under `fileLinkGrants`, keyed by
source, project, workspace, workspace path and canonical destination. The backend
resolves destinations on the source and injects only matching grants into its
file worker. Renderer-supplied grants are ignored. A changed destination requires
new consent; nested external links require their own grants. Read-only ancestor
links also constrain descendant writes. These permissions affect only the Files
module, not Codex, commands or explicit external application actions.

Permission changes refresh the tree and the access state of open documents
without replacing their buffers. Already loaded contents remain available after
revocation. A grant acknowledges a path, not a permanent inode identity; normal
file replacement at the same location remains possible.

Only valid UTF-8 is editable. UTF-8 BOM and LF/CRLF are preserved on save. Binary,
UTF-16 and invalid UTF-8 data are rejected. Mixed line endings remain read only
because Monaco normalizes them internally. The UI keeps its text in LF form.

Every save checks a revision combining the canonical location, file identity,
modification timestamp and SHA-256 of the bytes. This catches external edits,
replacement and moves even when timestamps alone are insufficient. The backend
serializes saves and permission changes within one runtime. It writes and syncs
an exclusive temporary file beside the destination, checks the revision again,
then replaces the destination using rename. Regular Unix permission bits and
ownership are retained; platform-specific ACLs and extended attributes are not
part of this version's preservation contract.

This is optimistic concurrency, not a filesystem transaction shared with other
programs. An unrelated process can still write in the short interval between
final comparison and rename. Symlink/path validation has the same limitation
against concurrent directory replacement. Do not treat this editor as a sandbox
for hostile filesystem mutation. There is no portable cross-process atomic
compare-and-swap exposed by Codex or Node's filesystem API.

Visible documents are checked every five seconds and on window focus. Clean
buffers reload automatically; dirty buffers keep their text and report a
conflict. Inactive buffers are checked when shown, and every save independently
revalidates the disk revision. Missing or inaccessible files keep their open
contents. Saving never deliberately creates a missing destination. Reloading a
dirty file always requires explicit confirmation; there is no force-overwrite
shortcut. Source failures and native error details remain next to the document.

External opening uses the existing host opener only for sources declaring local
access. Paths from WSL or SSH are never interpreted on the Electron host. A
source without the process API or Node.js reports an unavailable capability;
it does not fall back to an unrelated local directory.

## Monaco and future viewers

Monaco is an explicit UI dependency for editing, search/replace, line navigation,
and undo. The editor, tokenizers, workers and styles are bundled by Vite and
loaded on demand. There is no CDN or runtime model download. JSON schema network
requests are disabled. Full TypeScript project services and language servers
are deliberately excluded.

## Syntax highlighting

Home's Syntax highlighting section searches the bundled Shiki catalogue and
persists per-language activation in `settings.json` (`disabledFileLanguages`).
All catalogue entries are enabled by default; disabling one displays its files
as plain text. Changes apply to mounted editors and to retained documents when
they are shown again, without recreating models or changing their undo history.
The document toolbar can override automatic language detection for unusual names
or grammars without filename associations. This choice lasts for the document's
in-memory lifetime and never modifies its contents.

`shiki` and `@shikijs/monaco` reuse maintained TextMate grammars instead of local
TOML/Just tokenizers. The engine, themes, and grammar chunks are bundled for
offline use. The catalogue page imports metadata only. Opening a recognized
file loads its grammar and embedded dependencies; failed loads leave the editor
usable as plain text. Theme changes update all loaded tokenizers. The adapter
uses a private Monaco facade so lazy registrations cannot repeatedly patch
global editor functions. Monaco editing configurations retain comment/bracket
behavior independently of the TextMate tokenizers.

`npm run generate:file-languages` regenerates catalogue associations and lazy
configuration loaders from installed Shiki/Monaco packages. Run it after updating
those dependencies. Generated metadata uses exact filenames before longest
suffix matches, including Dockerfile variants and Justfiles. Custom TextMate
imports and extension marketplace installation are future additions.

## Integration with other viewers

Other modules can call `project.files.open(target, workspaceName, position)`.
`position` supports a line/column and optional end position. For generated or
debugger-owned sources, `openVirtual(id, name, content, language, position)` adds
an immutable document with no disk target. Producers can call
`document.setAnnotations(...)` with viewer-neutral diagnostic ranges. Monaco
renders these as markers; the explorer has no debugger-specific logic.

A future detached window must share document ownership rather than independently
editing copies of the same file. Window synchronization, specialized binary
viewers and persistent drafts are not implemented here.

## Validation

Targeted tests cover bounded reads, UTF-8/BOM/CRLF, symlinks, traversal, deleted
files, conflicts, source routing, streamed multilingual input, workspace
isolation, late responses, failed saves, virtual sources, and close protection.
They use disposable fixtures and no network or language-model calls.

Useful commands:

```sh
npm test
npm run check
npm run build -w apps/electron-app
```

Manual checks before release:

1. In both themes, open folders, dotfiles and files in different workspaces.
2. Edit two documents, switch between them and the chat, and check selection,
   scroll, undo history and the chat draft. Repeat while a chat turn is running.
3. Check Ctrl/Cmd+S, Ctrl/Cmd+F, replacement and line navigation in Monaco.
4. Change or delete an open file externally with and without local edits; verify
   reload, conflict feedback, failed saves and preservation of the buffer.
5. Close a dirty document/project/application and attempt an updater restart;
   exercise save, discard and cancel, including a disconnected source.
6. Exercise local Windows/macOS, WSL and SSH separately. Local Linux tests and
   source transport tests do not establish native behavior on those platforms.
7. Open the packaged application offline and verify editor worker loading.

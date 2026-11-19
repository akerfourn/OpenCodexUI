# Application error feedback

Operational failures use the application error journal and one global snackbar
with a link to the logs. Panels, dialogs and previews retain their inputs,
operation state and retry actions without embedding technical error messages.
Field validation, destructive-action explanations and workflow states remain
next to the relevant controls.

All backend request failures use `RuntimeErrorCoordinator`. Error events include
the request type so a failed tool or settings action does not reset unrelated
chat state. Electron-owned requests report their own failures and do not report
delegated backend failures twice. Completed-turn failures and blocked deferred
deletions are also journaled when they happen.

Renderer failures use `RootStore.reportError`, the application reporting context
or a file document's reporting capability. Keep the original rejection object:
the request boundary marks backend failures as already reported, and nested
renderer catches must not create another log entry. Structured file failures
retain their state and report changed diagnostics, avoiding repeated notices
from identical background checks. Rendering errors preserve fallback content.

Journal entries keep the original message and available technical details. The
snackbar uses concise localized text, can be dismissed, and closes automatically.
Local notification delivery does not depend on journal persistence succeeding;
a journal write failure never recursively reports itself.

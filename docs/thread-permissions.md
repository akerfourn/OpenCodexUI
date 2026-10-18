# Conversation permissions

Open a chat's **…** menu in the conversation list, then choose **Permissions**
to read its effective Codex settings. The chat must be idle and have a connected
source. A new local draft has no native settings to edit yet. You can manage
another conversation's permissions without switching the selected chat.

The dialog shows filesystem access, network access, the active profile, and
whether approval requests go to you or to automatic review. It reads the
conversation's settings instead of assuming the global defaults apply.

Choose the desired settings, then select **Apply**. The dialog stays open and
confirms success only after rereading the settings from Codex. The changes
apply to subsequent messages in the same conversation; its history is kept.
Closing without applying discards the selections.

The native approval policy and application defaults are preserved. Automatic
review can still reject an action. Custom access profiles and isolated
workspaces keep their access restrictions; their approval reviewer can be
changed independently.

If settings changed elsewhere, the dialog asks you to refresh before applying
again. Permission changes and message submissions cannot run concurrently in
the same chat through this application.

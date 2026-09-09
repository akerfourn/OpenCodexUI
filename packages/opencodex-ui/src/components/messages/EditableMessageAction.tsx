/** Renders the edit action for the latest editable user message. */
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { IconButton, Tooltip } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { ChatActionsStore } from "../../stores/chat/ChatActionsStore";

type EditableMessageActionProps = {
  actions: ChatActionsStore;
  turnId: string;
  itemId: string;
  content: string;
  onStartEdit(content: string): void;
};

/** Observes edit eligibility without making the whole message list observe it. */
function EditableMessageAction({
  actions,
  turnId,
  itemId,
  content,
  onStartEdit
}: EditableMessageActionProps) {
  const { t } = useTranslation();
  const editableItem = actions.editableLastUserItemIdentity;
  const isEditable = editableItem?.turnId === turnId && editableItem.itemId === itemId;

  if (!isEditable) {
    return null;
  }

  function handleEdit(): void {
    onStartEdit(content);
  }

  return (
    <Tooltip title={t("message.edit")}>
      <IconButton
        aria-label={t("message.edit")}
        size="small"
        onClick={handleEdit}
        sx={{
          color: "text.secondary",
          height: 24,
          width: 24,
          p: 0.25
        }}
      >
        <EditOutlinedIcon sx={{ fontSize: 15 }} />
      </IconButton>
    </Tooltip>
  );
}

export const EditableMessageActionX = observer(EditableMessageAction);

import { observer } from "mobx-react-lite";
import { useState } from "react";

import type { RootStore } from "../stores/RootStore";

type ChatHeaderProps = {
  store: RootStore;
};

export const ChatHeader = observer(function ChatHeader({ store }: ChatHeaderProps) {
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const currentThread = store.currentThread;

  if (currentThread === null) {
    return null;
  }

  const title = currentThread.title || currentThread.preview || "Nouvelle conversation";
  const renameModal = isRenameModalOpen ? (
    <RenameModal
      value={renameValue}
      title={title}
      onCancel={handleRenameCancel}
      onChange={handleRenameChange}
      onSubmit={handleRenameSubmit}
    />
  ) : null;

  function handleRenameOpen(): void {
    setRenameValue(title);
    setIsRenameModalOpen(true);
  }

  function handleRenameCancel(): void {
    setIsRenameModalOpen(false);
    setRenameValue("");
  }

  function handleRenameChange(value: string): void {
    setRenameValue(value);
  }

  function handleRenameSubmit(): void {
    if (renameValue.trim().length > 0) {
      store.renameCurrentThread(renameValue);
      setIsRenameModalOpen(false);
      setRenameValue("");
    }
  }

  function handleRefreshThread(): void {
    store.refreshCurrentThread();
  }

  return (
    <>
      <header className="chat-header">
        <div className="chat-title">
          <h2>{title}</h2>
          <p>{currentThread.projectPath ?? "Workspace non renseigné"}</p>
          {currentThread.model !== null ? <p>Modèle: {currentThread.model}</p> : null}
          {currentThread.reasoningEffort !== null ? <p>Raisonnement: {currentThread.reasoningEffort}</p> : null}
        </div>
        <div className="chat-header-actions">
          <IconButton
            label="Rafraîchir"
            icon="refresh"
            onClick={handleRefreshThread}
            disabled={store.isRefreshingThread}
          />
          <IconButton
            label="Renommer"
            icon="edit"
            onClick={handleRenameOpen}
          />
        </div>
      </header>
      {renameModal}
    </>
  );
});

function RenameModal({ value, title, onCancel, onChange, onSubmit }: RenameModalProps) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    onChange(event.target.value);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  return (
    <div className="modal-backdrop">
      <form className="rename-dialog" role="dialog" aria-modal="true" onSubmit={handleSubmit}>
        <header>
          <h2>Renommer le chat</h2>
          <p>{title}</p>
        </header>
        <input value={value} autoFocus onChange={handleChange} />
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Annuler
          </button>
          <button className="primary-button" type="submit">
            Renommer
          </button>
        </div>
      </form>
    </div>
  );
}

type RenameModalProps = {
  value: string;
  title: string;
  onCancel(): void;
  onChange(value: string): void;
  onSubmit(): void;
};

type IconButtonProps = {
  label: string;
  icon: "refresh" | "edit";
  disabled?: boolean;
  onClick(): void;
};

function IconButton({ label, icon, disabled = false, onClick }: IconButtonProps) {
  return (
    <button
      className="icon-button"
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}

function Icon({ name }: { name: IconButtonProps["icon"] }) {
  if (name === "refresh") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 12a8 8 0 0 1-13.7 5.6" />
        <path d="M4 12A8 8 0 0 1 17.7 6.4" />
        <path d="M17 2v5h5" />
        <path d="M7 22v-5H2" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

import { observer } from "mobx-react-lite";
import { useLayoutEffect, useRef, useState } from "react";

import type { RootStore } from "../stores/RootStore";
import { MarkdownMessage } from "./MarkdownMessage";

type ChatViewProps = {
  store: RootStore;
};

export const ChatView = observer(function ChatView({ store }: ChatViewProps) {
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const currentThread = store.currentThread;
  const title = currentThread?.title || currentThread?.preview || "Nouvelle conversation";
  const emptyContent = currentThread === null ? <EmptyState store={store} /> : null;
  const renameModal = isRenameModalOpen && currentThread !== null ? (
    <RenameModal
      value={renameValue}
      title={title}
      onCancel={handleRenameCancel}
      onChange={handleRenameChange}
      onSubmit={handleRenameSubmit}
    />
  ) : null;
  const chatContent = currentThread === null ? null : (
    <>
      <header className="chat-header">
        <div className="chat-title">
          <h2>{title}</h2>
          <p>{currentThread.projectPath ?? "Workspace non renseigné"}</p>
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

      <div className="messages" ref={messagesRef}>
        {store.messages.map((message) => (
          <article className={`message ${message.role}`} key={message.id}>
            <MarkdownMessage markdown={message.content} />
          </article>
        ))}
      </div>

      {store.settings.showActivityPanel ? <ActivityPanel store={store} /> : null}
      <Composer store={store} />
      {renameModal}
    </>
  );

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

  useLayoutEffect(() => {
    const element = messagesRef.current;

    if (element === null) {
      return;
    }

    element.scrollTop = element.scrollHeight;
  }, [currentThread?.id, store.messages.length]);

  return (
    <div className="chat-view">
      {emptyContent}
      {chatContent}
    </div>
  );
});

type RenameModalProps = {
  value: string;
  title: string;
  onCancel(): void;
  onChange(value: string): void;
  onSubmit(): void;
};

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

const EmptyState = observer(function EmptyState({ store }: ChatViewProps) {
  function handleNewThread(): void {
    store.createThread();
  }

  return (
    <div className="empty-state">
      <h2>Aucune conversation ouverte</h2>
      <button className="primary-button" type="button" onClick={handleNewThread}>
        Démarrer un chat
      </button>
    </div>
  );
});

const ActivityPanel = observer(function ActivityPanel({ store }: ChatViewProps) {
  if (store.activity.length === 0) {
    return null;
  }

  return (
    <details className="activity-panel" open={store.isWorking}>
      <summary>Activité en cours</summary>
      <ul>
        {store.activity.slice(-20).map((activity, index) => (
          <li key={`${index}-${activity}`}>{activity}</li>
        ))}
      </ul>
    </details>
  );
});

const Composer = observer(function Composer({ store }: ChatViewProps) {
  function handleInput(event: React.ChangeEvent<HTMLTextAreaElement>): void {
    store.input = event.target.value;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    store.sendMessage();
  }

  function handleModelChange(event: React.ChangeEvent<HTMLSelectElement>): void {
    store.selectedModel = event.target.value.length > 0 ? event.target.value : null;
  }

  function handleEffortChange(event: React.ChangeEvent<HTMLSelectElement>): void {
    store.reasoningEffort = event.target.value as RootStore["reasoningEffort"];
  }

  function handleInterrupt(): void {
    store.interruptTurn();
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <textarea
        value={store.input}
        placeholder="Message à Codex"
        rows={4}
        onChange={handleInput}
      />
      <div className="composer-controls">
        <select value={store.selectedModel ?? ""} onChange={handleModelChange}>
          {store.models.map((model) => (
            <option value={model} key={model}>
              {model}
            </option>
          ))}
        </select>
        <select value={store.reasoningEffort} onChange={handleEffortChange}>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
        <div className="spacer" />
        {store.isWorking ? (
          <button type="button" onClick={handleInterrupt}>
            Interrompre
          </button>
        ) : null}
        <button className="primary-button" type="submit" disabled={store.isWorking}>
          Envoyer
        </button>
      </div>
    </form>
  );
});

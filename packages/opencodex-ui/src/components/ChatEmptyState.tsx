import type { RootStore } from "../stores/RootStore";

type ChatEmptyStateProps = {
  store: RootStore;
};

export function ChatEmptyState({ store }: ChatEmptyStateProps) {
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
}

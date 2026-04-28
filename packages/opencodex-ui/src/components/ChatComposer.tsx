import { useEffect, useState } from "react";

import type {
  OpenCodexReasoningEffort
} from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../stores/RootStore";

type ChatComposerProps = {
  store: RootStore;
  currentThreadId: string | null;
  selectedModel: string | null;
  reasoningEffort: OpenCodexReasoningEffort;
  modelOptions: string[];
  isWorking: boolean;
};

export function ChatComposer({
  store,
  currentThreadId,
  selectedModel,
  reasoningEffort,
  modelOptions,
  isWorking
}: ChatComposerProps) {
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setDraft("");
  }, [currentThreadId]);

  function handleInput(event: React.ChangeEvent<HTMLTextAreaElement>): void {
    setDraft(event.target.value);
  }

  function submitDraft(): void {
    store.sendMessage(draft);
    setDraft("");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    submitDraft();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (!event.ctrlKey || event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    submitDraft();
  }

  function handleModelChange(event: React.ChangeEvent<HTMLSelectElement>): void {
    store.setSelectedModel(event.target.value.length > 0 ? event.target.value : null);
  }

  function handleEffortChange(event: React.ChangeEvent<HTMLSelectElement>): void {
    store.setReasoningEffort(event.target.value as OpenCodexReasoningEffort);
  }

  function handleInterrupt(): void {
    store.interruptTurn();
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <textarea
        value={draft}
        placeholder="Message à Codex"
        rows={4}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
      />
      <div className="composer-controls">
        <select value={selectedModel ?? ""} onChange={handleModelChange}>
          {modelOptions.map((model) => (
            <option value={model} key={model}>
              {model}
            </option>
          ))}
        </select>
        <select value={reasoningEffort} onChange={handleEffortChange}>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="xhigh">xhigh</option>
        </select>
        <div className="spacer" />
        {isWorking ? (
          <button type="button" onClick={handleInterrupt}>
            Interrompre
          </button>
        ) : null}
        <button className="primary-button" type="submit" disabled={isWorking}>
          Envoyer
        </button>
      </div>
    </form>
  );
}

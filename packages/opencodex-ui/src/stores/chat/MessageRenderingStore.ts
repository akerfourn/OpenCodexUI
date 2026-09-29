import { makeAutoObservable, runInAction } from "mobx";
import {
  normalizeMessageRenderingDefaults, resolveMessageRendering,
  type MessageRenderingContext, type MessageRenderingEntry, type MessageRenderingOptions,
  type MessageRenderingOverride, type OpenCodexRequest, type OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";

interface RenderingPort {
  readonly settings: OpenCodexSettings;
  request<T>(request: OpenCodexRequest): Promise<T>;
}

interface ThreadPreferences {
  loaded: boolean;
  error: string | null;
  entries: Map<string, MessageRenderingEntry>;
}

/** Keeps presentation state separate from conversation DTOs and composer/model inputs. */
export class MessageRenderingStore {
  /** Sparse exceptions for conversations opened during this application session. */
  private readonly threads = new Map<string, ThreadPreferences>();
  /** Shares concurrent initial reads; replies always target their original conversation. */
  private readonly loads = new Map<string, Promise<void>>();
  /** Disallows competing writes to the same message while allowing other messages to save. */
  readonly pending = new Set<string>();

  /** Reads global settings lazily so inherited choices react immediately to global changes. */
  constructor(private readonly root: RenderingPort) {
    makeAutoObservable<this, "root" | "loads">(this, { root: false, loads: false }, { autoBind: true });
  }

  /** Provides a stable transport-safe identity key without separator collisions. */
  key(context: MessageRenderingContext, turnId?: string, itemId?: string): string {
    return JSON.stringify([context.sourceId, context.threadId, turnId, itemId]);
  }

  /** Exposes the current role defaults to both the menu and message renderer. */
  defaults(role: "user" | "assistant"): MessageRenderingOptions {
    return normalizeMessageRenderingDefaults(this.root.settings.messageRendering)[role];
  }

  /** Resolves the current effective flags, including exceptions using explicit false values. */
  resolve(context: MessageRenderingContext, turnId: string, itemId: string,
    role: "user" | "assistant"): MessageRenderingOptions {
    return resolveMessageRendering(this.root.settings.messageRendering, role, this.override(context, turnId, itemId));
  }

  /** Returns a fresh nullable DTO so editing a control cannot mutate stored preferences. */
  override(context: MessageRenderingContext, turnId: string, itemId: string): MessageRenderingOverride {
    const entry = this.threads.get(this.key(context))?.entries.get(JSON.stringify([turnId, itemId]));
    return { markdown: entry?.markdown ?? null, math: entry?.math ?? null };
  }

  /** Prevents controls from overwriting an exception before its initial read has completed. */
  loaded(context: MessageRenderingContext): boolean {
    return this.threads.get(this.key(context))?.loaded === true;
  }

  /** Reports a failed initial read beside the settings controls rather than silently ignoring it. */
  error(context: MessageRenderingContext): string | null {
    return this.threads.get(this.key(context))?.error ?? null;
  }

  /** Loads all exceptions in one request per conversation, with retry after a failed read. */
  async load(context: MessageRenderingContext): Promise<void> {
    const key = this.key(context);
    if (this.threads.get(key)?.loaded) return;
    const pending = this.loads.get(key);
    if (pending !== undefined) return await pending;
    const operation = this.read(context, key);
    this.loads.set(key, operation);
    try { await operation; }
    finally { this.loads.delete(key); }
  }

  /** Keeps failed writes from replacing the previous confirmed preference. */
  async save(context: MessageRenderingContext, entry: MessageRenderingEntry): Promise<void> {
    const pendingKey = this.key(context, entry.turnId, entry.itemId);
    if (this.pending.has(pendingKey)) return;
    this.pending.add(pendingKey);
    try {
      await this.load(context);
      // Explicitly copy each field before crossing IPC; inputs may originate in MobX.
      const saved = { turnId: entry.turnId, itemId: entry.itemId, markdown: entry.markdown, math: entry.math };
      await this.root.request({ type: "messageRendering.set",
        context: { sourceId: context.sourceId, threadId: context.threadId }, entry: saved });
      runInAction(() => {
        const entries = this.threads.get(this.key(context))!.entries;
        const itemKey = JSON.stringify([saved.turnId, saved.itemId]);
        if (saved.markdown === null && saved.math === null) entries.delete(itemKey);
        else entries.set(itemKey, saved);
      });
    } finally {
      runInAction(() => { this.pending.delete(pendingKey); });
    }
  }

  /** Routes late responses into the captured conversation and records load failures. */
  private async read(context: MessageRenderingContext, key: string): Promise<void> {
    try {
      const entries = await this.root.request<MessageRenderingEntry[]>({ type: "messageRendering.read",
        context: { sourceId: context.sourceId, threadId: context.threadId } });
      runInAction(() => {
        this.threads.set(key, { loaded: true, error: null,
          entries: new Map(entries.map(entry => [JSON.stringify([entry.turnId, entry.itemId]), { ...entry }])) });
      });
    } catch (error) {
      runInAction(() => { this.threads.set(key, { loaded: false, error: String(error), entries: new Map() }); });
      throw error;
    }
  }
}

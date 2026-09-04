import { makeAutoObservable } from "mobx";

import type { OpenCodexTurn } from "@open-codex-ui/opencodex-protocol";

import {
  buildChatTurnStructure,
  type ChatSubTurn,
  type ChatTurnStructure
} from "./chatTurnStructure";

/**
 * Holds the UI-ready representation of one Codex turn.
 */
export class ChatTurnStore {
  /** Raw Codex turn represented by this store. */
  turn: OpenCodexTurn;
  /** Cached structural decomposition reused while live item content changes. */
  private structure: ChatTurnStructure;

  /**
   * Creates a store for one Codex turn.
   *
   * @param turn Raw Codex turn.
   */
  constructor(turn: OpenCodexTurn) {
    this.turn = turn;
    makeAutoObservable(this);
    this.structure = buildChatTurnStructure(this.turn);
  }

  /** Turn identifier. */
  get id(): string {
    return this.turn.id;
  }

  /** Owning thread identifier. */
  get threadId(): string {
    return this.turn.threadId;
  }

  /** Structured sub-turns derived from raw turn items. */
  get subTurns(): ChatSubTurn[] {
    return this.structure.subTurns;
  }

  /** Final answer item derived from raw turn items. */
  get finalAnswer(): ChatTurnStructure["finalAnswer"] {
    return this.structure.finalAnswer;
  }

  /** Whether the turn already contains a final answer. */
  get hasFinalAnswer(): boolean {
    return this.finalAnswer !== null;
  }

  /** Whether the turn has a user/reasoning block after its final answer. */
  get hasOpenSubTurn(): boolean {
    return this.structure.hasOpenSubTurn;
  }

  /**
   * Replaces the raw turn after cache or live updates.
   *
   * @param turn Raw Codex turn.
   */
  setTurn(turn: OpenCodexTurn): void {
    if (this.turn === turn) {
      return;
    }

    this.turn = turn;
    this.structure = buildChatTurnStructure(this.turn);
  }

  /** Rebuilds the structural view after an in-place item insertion or removal. */
  refreshStructure(): void {
    this.structure = buildChatTurnStructure(this.turn);
  }

  /**
   * Checks whether this turn is the currently running turn.
   *
   * @param activeTurnId Active turn id tracked by the chat store.
   * @param isWorking Whether the chat is currently working.
   * @returns Whether this turn should render as running.
   */
  isRunning(activeTurnId: string | null, isWorking: boolean): boolean {
    if (!isWorking) {
      return false;
    }

    const isActiveTurn = this.id === activeTurnId || this.id.startsWith("pending:");

    if (!isActiveTurn) {
      return false;
    }

    return !this.hasFinalAnswer || this.hasOpenSubTurn || this.turn.items.length === 0;
  }

}

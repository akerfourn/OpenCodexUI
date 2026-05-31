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
  turn: OpenCodexTurn;

  constructor(turn: OpenCodexTurn) {
    this.turn = turn;
    makeAutoObservable(this);
  }

  get id(): string {
    return this.turn.id;
  }

  get threadId(): string {
    return this.turn.threadId;
  }

  get subTurns(): ChatSubTurn[] {
    return this.structure.subTurns;
  }

  get finalAnswer(): ChatTurnStructure["finalAnswer"] {
    return this.structure.finalAnswer;
  }

  get hasFinalAnswer(): boolean {
    return this.finalAnswer !== null;
  }

  setTurn(turn: OpenCodexTurn): void {
    this.turn = turn;
  }

  isRunning(activeTurnId: string | null, isWorking: boolean): boolean {
    if (!isWorking || this.hasFinalAnswer) {
      return false;
    }

    return this.id === activeTurnId || this.id.startsWith("pending:");
  }

  private get structure(): ChatTurnStructure {
    return buildChatTurnStructure(this.turn);
  }
}

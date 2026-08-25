/**
 * Pure eligibility rules shared by chat action handlers.
 */
import type { ChatRuntimeStore } from "./ChatRuntimeStore";

/** Runtime and project state shared by chat action guards. */
export interface ChatActionGuardContext {
  /** Whether the project only exposes cached data. */
  isReadOnly: boolean;
  /** Runtime state of the owning chat. */
  runtime: ChatRuntimeStore;
}

/** Context used when steering an active turn. */
export interface ChatSteeringGuardContext extends ChatActionGuardContext {
  /** Whether application settings enable steering. */
  allowTurnSteering: boolean;
  /** Whether the chat is associated with a Codex source. */
  hasSource: boolean;
}

/** Context used when checking whether a terminal turn can be edited. */
export interface ChatEditGuardContext extends ChatActionGuardContext {
  /** Number of loaded turns in the timeline. */
  turnCount: number;
}

/**
 * Checks whether a last-turn edit can be considered.
 *
 * @param context Project, runtime, and timeline state.
 * @returns Whether edit-specific timeline checks may run.
 */
export function canEditLastTurn(context: ChatEditGuardContext): boolean {
  const { isReadOnly, runtime, turnCount } = context;

  return (
    !isReadOnly &&
    !runtime.isWorking &&
    !runtime.isStartingTurn &&
    !runtime.isEditingLastTurn &&
    !runtime.isRecovering &&
    turnCount > 0
  );
}

/**
 * Checks whether an advanced Codex action can start a new turn.
 *
 * @param context Project and runtime state.
 * @returns Whether the action may start.
 */
export function canRunAdvancedChatAction(context: ChatActionGuardContext): boolean {
  const { isReadOnly, runtime } = context;

  return (
    !isReadOnly &&
    !runtime.isWorking &&
    !runtime.isStartingTurn &&
    !runtime.isEditingLastTurn &&
    !runtime.isRecovering
  );
}

/**
 * Checks whether a thread snapshot can be refreshed manually.
 *
 * @param context Project and runtime state.
 * @returns Whether refresh may start.
 */
export function canRefreshChat(context: ChatActionGuardContext): boolean {
  const { isReadOnly, runtime } = context;

  return (
    !isReadOnly &&
    !runtime.isRefreshing &&
    !runtime.isWorking &&
    !runtime.isStartingTurn &&
    !runtime.isEditingLastTurn &&
    !runtime.isRecovering
  );
}

/**
 * Checks whether steering is allowed for the active turn.
 *
 * @param context Application, project, source, and runtime state.
 * @returns Whether steering may start.
 */
export function canSteerChat(context: ChatSteeringGuardContext): boolean {
  const {
    allowTurnSteering,
    hasSource,
    isReadOnly,
    runtime
  } = context;

  return (
    allowTurnSteering &&
    runtime.isWorking &&
    runtime.activeTurnId !== null &&
    hasSource &&
    !isReadOnly &&
    !runtime.isStartingTurn &&
    !runtime.isEditingLastTurn &&
    !runtime.isRecovering
  );
}

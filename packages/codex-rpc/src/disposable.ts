/**
 * Provides small helpers for disposable subscriptions.
 */
import type { Disposable } from "./types";

/**
 * Wraps a cleanup callback in the project's disposable contract.
 *
 * @param dispose Cleanup callback to expose.
 * @returns Disposable wrapper that calls the provided cleanup callback.
 */
export function createDisposable(dispose: () => void): Disposable {
  return { dispose };
}

import crypto from "node:crypto";

import type {
  OpenCodexLogCategory,
  OpenCodexLogEntry,
  OpenCodexLogPolicy,
  OpenCodexLogType
} from "@open-codex-ui/opencodex-protocol";

import { MAX_SESSION_LOG_BYTES } from "./applicationLogPolicies.js";
import { cloneJsonValue, estimateJsonBytes } from "./applicationLogSerialization.js";

/** Input used to create one process-local log entry. */
export type SessionLogInput = {
  type: OpenCodexLogType;
  message: string;
  details: unknown;
  category?: OpenCodexLogCategory;
};

/** A session log is visible to the UI but is never written to SQLite. */
export type SessionLog = OpenCodexLogEntry & { storage: "session" };

type SessionLogRecord = {
  log: SessionLog;
  bytes: number;
};

/** Result of adding one entry to the bounded session buffer. */
export type SessionLogAddResult = {
  log: SessionLog | null;
  evictedIds: string[];
};

/** Process-local ring buffer with per-category and total byte bounds. */
export class SessionLogBuffer {
  /** Process-local session entries in ascending creation order. */
  private readonly records: SessionLogRecord[] = [];
  /** Total serialized UTF-8 bytes currently held by the buffer. */
  private totalBytes = 0;
  /** Monotone millisecond component used to order session entries. */
  private lastTimestampMs = 0;

  /** Creates a session buffer using the supplied clock. */
  constructor(private readonly now: () => Date = () => new Date()) {}

  /** Adds an entry and evicts the oldest entries required by both bounds. */
  add(input: SessionLogInput, maxEntries: number): SessionLogAddResult {
    const log: SessionLog = {
      id: `session-${crypto.randomUUID()}`,
      type: input.type,
      message: input.message,
      details: cloneJsonValue(input.details),
      createdAt: this.createTimestamp(),
      storage: "session",
      ...(input.category === undefined ? {} : { category: input.category })
    };
    const bytes = estimateJsonBytes(log);
    if (bytes > MAX_SESSION_LOG_BYTES) {
      return { log: null, evictedIds: [] };
    }

    this.records.push({ log, bytes });
    this.totalBytes += bytes;
    const evictedIds = this.trimCategory(input.type, input.category, maxEntries);
    evictedIds.push(...this.trimBytes());
    return { log, evictedIds };
  }

  /** Reapplies policies after a settings update and returns removed ids. */
  trimForPolicies(resolvePolicy: ResolveSessionPolicy): string[] {
    const removedIds: string[] = [];
    for (let index = this.records.length - 1; index >= 0; index -= 1) {
      const record = this.records[index];
      if (record === undefined) {
        continue;
      }
      if (resolvePolicy(record.log.type, record.log.category).mode === "disabled") {
        const removed = this.removeAt(index);
        if (removed !== null) {
          removedIds.push(removed.id);
        }
      }
    }

    const sessionCategories = new Map<string, { type: OpenCodexLogType; category?: OpenCodexLogCategory; maxEntries: number }>();
    for (const record of [...this.records]) {
      const policy = resolvePolicy(record.log.type, record.log.category);
      const categoryKey = sessionCategoryKey(record.log.type, record.log.category);
      if (policy.mode === "session" && !sessionCategories.has(categoryKey)) {
        sessionCategories.set(categoryKey, {
          type: record.log.type,
          category: record.log.category,
          maxEntries: policy.maxEntries
        });
      }
    }
    for (const category of sessionCategories.values()) {
      removedIds.push(...this.trimCategory(category.type, category.category, category.maxEntries));
    }
    removedIds.push(...this.trimBytes());
    return removedIds;
  }

  /** Removes one entry by id without emitting transport events. */
  remove(logId: string): void {
    const index = this.records.findIndex((record) => record.log.id === logId);
    if (index >= 0) {
      this.removeAt(index);
    }
  }

  /** Removes all entries before an exclusive timestamp. */
  removeOlderThan(cutoff: string): void {
    for (let index = this.records.length - 1; index >= 0; index -= 1) {
      const record = this.records[index];
      if (record !== undefined && record.log.createdAt < cutoff) {
        this.removeAt(index);
      }
    }
  }

  /** Removes every session entry. */
  clear(): void {
    this.records.length = 0;
    this.totalBytes = 0;
  }

  /** Returns entries matching an exclusive cursor and optional severities. */
  read(
    beforeCreatedAt: string | null,
    types?: OpenCodexLogType[],
    beforeId?: string | null
  ): OpenCodexLogEntry[] {
    return this.records
      .map((record) => record.log)
      .filter((log) => isBeforeCursor(log, beforeCreatedAt, beforeId))
      .filter((log) => types === undefined || types.includes(log.type));
  }

  /** Trims the oldest entries for one policy category. */
  private trimCategory(
    type: OpenCodexLogType,
    category: OpenCodexLogCategory | undefined,
    maxEntries: number
  ): string[] {
    const categoryKey = sessionCategoryKey(type, category);
    let categoryCount = this.records.filter((record) => (
      sessionCategoryKey(record.log.type, record.log.category) === categoryKey
    )).length;
    const removedIds: string[] = [];

    while (categoryCount > maxEntries) {
      const oldestIndex = this.records.findIndex((record) => (
        sessionCategoryKey(record.log.type, record.log.category) === categoryKey
      ));
      if (oldestIndex < 0) {
        break;
      }

      const removed = this.removeAt(oldestIndex);
      if (removed !== null) {
        removedIds.push(removed.id);
      }
      categoryCount -= 1;
    }

    return removedIds;
  }

  /** Trims the oldest entries until the total byte budget is satisfied. */
  private trimBytes(): string[] {
    const removedIds: string[] = [];
    while (this.totalBytes > MAX_SESSION_LOG_BYTES && this.records.length > 0) {
      const removed = this.removeAt(0);
      if (removed !== null) {
        removedIds.push(removed.id);
      }
    }
    return removedIds;
  }

  /** Removes one record and returns its public entry. */
  private removeAt(index: number): SessionLog | null {
    const [record] = this.records.splice(index, 1);
    if (record === undefined) {
      return null;
    }

    this.totalBytes -= record.bytes;
    return record.log;
  }

  /** Generates a monotonic ISO timestamp for deterministic in-memory ordering. */
  private createTimestamp(): string {
    const candidate = this.now();
    const currentTimeMs = Number.isNaN(candidate.getTime()) ? Date.now() : candidate.getTime();
    const timestampMs = Math.max(currentTimeMs, this.lastTimestampMs + 1);
    this.lastTimestampMs = timestampMs;
    return new Date(timestampMs).toISOString();
  }
}

/** Narrow policy resolver accepted by the session buffer. */
export type ResolveSessionPolicy = (
  type: OpenCodexLogType,
  category: OpenCodexLogCategory | undefined
) => OpenCodexLogPolicy;

/** Returns the independent category key used for session count limits. */
function sessionCategoryKey(
  type: OpenCodexLogType,
  category: OpenCodexLogCategory | undefined
): string {
  return category ?? type;
}

/** Applies the same timestamp/id cursor semantics as SQLite log queries. */
function isBeforeCursor(
  log: OpenCodexLogEntry,
  beforeCreatedAt: string | null,
  beforeId: string | null | undefined
): boolean {
  if (beforeCreatedAt === null) {
    return true;
  }
  if (log.createdAt < beforeCreatedAt) {
    return true;
  }

  return log.createdAt === beforeCreatedAt
    && beforeId !== undefined
    && beforeId !== null
    && log.id < beforeId;
}

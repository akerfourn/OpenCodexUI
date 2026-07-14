# Streaming And Renderer Performance

This document records the durable performance invariants used by OpenCodexUI.
They should remain valid when changing the Codex transport, cache, or chat UI.

## Streaming Pipeline

Assistant message deltas are grouped over 20 ms. Reasoning, command, tool, file,
and diff updates use a 50 ms window where their payload semantics allow it.

Buffered content must be emitted before its matching item, turn, process, or
source lifecycle boundary. Batches are scoped by source and logical owner so a
busy chat cannot reorder or absorb another chat's updates.

The live turn cache indexes active items and buffers growing strings. Pending
string segments are compacted into an ordered, bounded rope before final
materialization. Persistence and protocol boundaries always materialize the
complete value first.

## Renderer Work

Only the active project view is mounted. Project and chat stores remain alive so
drafts, work indicators, selected threads, layout, and timeline state survive a
tab switch.

A chat mounts ten recent turns for its first frame. A previously wider reading
window is restored after paint. Active reasoning mounts five recent items by
default, while completed reasoning remains collapsed.

Streaming Markdown refreshes at most every 150 ms. Syntax highlighting is
disabled while text streams and is scheduled after completed content has
painted. Large terminal output and diff details use bounded previews without
truncating the underlying chat data.

## Diagnostics

Standard monitoring is enabled by default and can be disabled in settings. It
stores only bounded, content-free aggregates such as counts, durations, payload
lengths, event-loop delay, long tasks, and Electron process metrics.

Advanced monitoring is available only with developer mode enabled. It adds
per-method and Markdown timing breakdowns. Raw notification throughput and the
real processing duration after batching are measured separately.

Automatic slowdown reports retain at most five minutes of samples and apply a
ten-minute cooldown. Chat text, reasoning, commands, and diffs must never be
copied into performance logs.

## Source Routing And Cache Identity

Live UI events should carry the source identifier known by their Codex channel.
Loaded chats are routed through a `sourceId` and `threadId` index, with a legacy
thread-only fallback for source-less cached or older events.

The in-memory backend cache and current SQLite schema still treat `threadId` as
globally unique. This matches Codex UUID behavior and avoids a broad cache
migration. A connector that can reuse thread identifiers across sources must
first introduce a composite source/thread cache identity through an idempotent
migration.

## Validation

Changes to these paths require `npm run typecheck`. Cache, batching, shared
mapping, or routing changes also require `npm test` and focused regression tests
for ordering, lifecycle cleanup, and full-content preservation.

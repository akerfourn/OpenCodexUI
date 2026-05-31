# OpenCodexUI 1.5.0

This release focuses on chat streaming performance, layout stability during
active reasoning, and exposing Codex service tiers in the composer.

## Highlights

- Added service tier selection for model turns:
  - read `serviceTiers` from Codex `model/list`
  - show a `Speed` / `Vitesse` selector next to model and reasoning controls
  - pass the selected tier to `turn/start`
  - keep `Auto` as the default when no explicit tier is selected
- Improved long-chat streaming performance by moving per-turn rendering into a
  dedicated `ChatTurnView` observer component
- Restored bottom-lock behavior while the final assistant message streams
- Prevented long reasoning/activity rows from expanding the central chat layout
  beyond its visible pane

## Improvements

- The model list now preserves metadata instead of reducing every model to a
  plain string
- Service tier choices are disabled when the selected model does not expose any
  tier
- The edit-last-message modal uses the same model, reasoning, and service tier
  controls as the main composer
- Long activity content inside the reasoning block now stays constrained to the
  chat width

## Internal

- Added protocol DTOs for model service tier metadata
- Extended turn start and edit requests with an optional `serviceTier`
- Kept message list rendering focused on scroll/window management while each
  turn owns its observable content reads
- Added width constraints around the chat message list and assistant activity
  accordion to avoid intrinsic-size layout expansion

## Notes

This version bumps the application and workspace packages to `1.5.0`.

No SQLite schema migration is included in this release. Service tier selection is
currently kept as local composer state and is not persisted per thread.

# OpenCodexUI UI Package Guidelines

This file applies to everything under `packages/opencodex-ui/`.

## Component boundaries

- Keep one React component per `.tsx` file.
- Do not define multiple React components in the same file.
- Small local helper functions are fine when they are plain functions, not
  components.
- If a helper starts to look reusable, move it to its own file.

## Export style

- Prefer direct named exports for undecorated components.

```tsx
export function ThreadList(props: ThreadListProps) {
  // ...
}
```

- Do not use `export const Component = observer(function Component() { ... })`.
- If a component needs `observer`, export the plain component first and then
  export the observed wrapper with an `X` suffix.

```tsx
export function ThreadList(props: ThreadListProps) {
  // ...
}

export const ThreadListX = observer(ThreadList);
```

- If a component needs `memo`, export the plain component first and then export
  the memoized wrapper with an `M` suffix.

```tsx
export function MarkdownMessage(props: MarkdownMessageProps) {
  // ...
}

export const MarkdownMessageM = memo(MarkdownMessage);
```

- Avoid combining `memo` and `observer` on the same component unless there is a
  clear measured reason.
- If both behaviors seem necessary, prefer splitting the component into smaller
  parts so each file stays simple and each wrapper stays obvious.

## Structure and readability

- Keep component names explicit and stable.
- Keep files focused on one visible UI responsibility.
- Prefer top-level named handlers and helpers over nested component factories.
- Keep the undecorated component as the source of truth; the suffixed export is
  the wrapper that is actually used by the app.


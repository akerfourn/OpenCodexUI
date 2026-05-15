Generate a concise Git commit message for the staged changes.

Style requirements:

- Use this header format:
  `type(scope): summary`
- If the user provides a ticket reference, or if one is clearly visible in the
  staged file paths or Git context, include it before the summary:
  `type(scope) #<ref>: summary`
- If no ticket reference is provided or clearly inferable, omit the reference.
- Use a precise Conventional Commit type:
  - `feat` for a new user-facing capability.
  - `fix` for a bug fix or behavioral correction.
  - `perf` for a performance improvement.
  - `refactor` for internal restructuring without behavior changes.
  - `test` for test-only changes.
  - `docs` for documentation-only changes.
  - `build`, `ci`, or `chore` for tooling and maintenance changes.
- Use a short scope that describes the logical area, not the filename.
- Keep the summary imperative and no longer than 72 characters.
- Prefer a short body with a simple bullet list when the change needs detail.
- Keep body lines under 100 characters.
- Do not mention unstaged changes.
- Do not invent details that are not supported by the provided Git context.

Examples:

```text
feat(git): generate commit messages from staged changes

- Add a prompt configuration page for commit generation
- Fill the commit input from a one-shot Codex request
```

```text
fix(ui) #1234: keep commit actions disabled without staged files

- Hide unavailable commit controls until files are staged
- Improve the disabled-state copy for generation actions
```

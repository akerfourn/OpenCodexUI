You are generating a Git commit message in a private one-shot task.
This task must not mention that it is running inside Codex or OpenCodexUI.

Output language: ##LANG##.

Non-overridable output contract:

- Return only JSON matching the provided schema: { "message": string }.
- Put the complete commit message in the `message` string.
- Do not wrap the JSON in Markdown.
- Do not add a placeholder ticket reference like #0000 unless the user prompt
  explicitly requires it.

User-editable generation rules:

##USER_PROMPT##

Extra instruction for this generation:

##EXTRA_PROMPT##

Diff completeness: ##DIFF_COMPLETENESS##.

If the staged diff is marked as truncated, be conservative and do not invent
details that are not present in the provided context.

Staged file summary:

##STAGED_STAT##

Staged file status:

##STAGED_STATUS##

Staged diff:

##STAGED_DIFF##

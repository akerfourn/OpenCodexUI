# OpenCodexUI 1.3.0

## OpenCodexUI 1.3.0

This release expands the Git panel into a more complete project workflow while
also tightening project/source recovery and composer stability.

### Highlights

- Added branch management from the Git panel:
  - list local and remote branches
  - switch to an existing branch
  - create and checkout a new local branch
- Added Git tag management:
  - list existing tags
  - create lightweight tags
  - select a reference tag
  - display the number of commits since the selected tag
- Added repository initialization for project folders that are not Git
  repositories yet
- Kept the reference tag display compact in the Git header, next to the branch
  context
- Persisted per-thread model and reasoning-effort composer settings to the
  thread cache
- Kept model and reasoning-effort selections reactive by standardizing MobX
  observer wrappers around composer-related UI
- Improved `@` file references so typing only `@` immediately shows root
  project entries before the user starts filtering

### Fixes

- Ensured folders opened as projects are associated with a usable Codex source
  instead of being cached as source-less active projects
- Recovered missing thread source associations from the request source when the
  cache has incomplete thread metadata
- Centralized thread source resolution in the project/chat stores so composer
  actions, file search, and message submission consume the same recovered source
- Fixed new chat and message submission failures caused by projects without a
  Codex source
- Made Git repository detection independent from localized Git error messages
- Excluded VCS implementation directories such as `.git`, `.hg`, and `.svn`
  from `@` file reference search results
- Fixed an intermittent composer issue where cancelling an autocomplete trigger
  could prevent the same `@` or `$` trigger from reopening at the same position

### Internal

- Extended the OpenCodex protocol with Git branch and tag requests/responses
- Added backend Git service coverage for repository initialization, branch
  switching, tag listing, lightweight tag creation, and commits-since-tag
  counting
- Added regression coverage for thread source fallback and file search filtering
- Added a Codex-backed root-directory fallback for empty file-reference searches
- Updated frontend guidelines to clarify MobX observer usage and transport
  boundary rules

### Notes

This version bumps the application and workspace packages to `1.3.0`.

The local cache schema is unchanged from `1.2.0`.

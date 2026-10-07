# OpenCodexUI 1.15.1

This patch release fixes Windows update downloads failing with HTTP 404.

## Fixes

- Use filenames without spaces for the Windows installer and portable
  executable. GitHub release assets and update metadata now use the same names.
- Add regression coverage for Windows artifact names using electron-builder's
  packaging configuration.

## Notes

Existing installations can update directly to `1.15.1`; intermediate versions
are not required. The corrected filenames take effect when this release is
built and published. Assets from previous releases are not modified.

No SQLite schema migration is introduced by this release.

/**
 * Covers pre-release version detection used by build diagnostics.
 */
import { describe, expect, it } from "vitest";

import { isPrereleaseVersion } from "../src/version";

describe("application version helpers", () => {
  it("should classify stable semantic versions as stable", () => {
    expect(isPrereleaseVersion("1.11.0")).toBe(false);
    expect(isPrereleaseVersion("1.11.0+build.42")).toBe(false);
  });

  it("should classify every semantic pre-release suffix as pre-release", () => {
    expect(isPrereleaseVersion("1.11.0-alpha.0")).toBe(true);
    expect(isPrereleaseVersion("1.11.0-beta.1")).toBe(true);
    expect(isPrereleaseVersion("1.11.0-rc.2")).toBe(true);
    expect(isPrereleaseVersion("1.11.0-nightly+build.42")).toBe(true);
  });

  it("should keep missing versions out of pre-release mode", () => {
    expect(isPrereleaseVersion(null)).toBe(false);
    expect(isPrereleaseVersion(undefined)).toBe(false);
    expect(isPrereleaseVersion("  ")).toBe(false);
  });
});

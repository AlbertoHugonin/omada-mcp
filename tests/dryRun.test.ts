import { describe, expect, it } from "vitest";
import {
  actionPreview,
  diff,
  formatDiff,
  postApplyReport,
  statePreview,
} from "../src/tools/dryRun.js";

describe("dryRun.diff", () => {
  it("returns no changes for identical values", () => {
    expect(diff(1, 1)).toEqual([]);
    expect(diff({ a: 1 }, { a: 1 })).toEqual([]);
    expect(diff({ a: { b: 2 } }, { a: { b: 2 } })).toEqual([]);
  });

  it("returns root-level diff for differing scalars", () => {
    expect(diff(1, 2)).toEqual([{ path: "(root)", before: 1, after: 2 }]);
  });

  it("walks nested objects and reports field paths", () => {
    const changes = diff({ a: { b: 1, c: 2 } }, { a: { b: 1, c: 3 } });
    expect(changes).toEqual([{ path: "a.c", before: 2, after: 3 }]);
  });

  it("reports added and removed fields", () => {
    const changes = diff({ a: 1 }, { a: 1, b: 2 });
    expect(changes).toContainEqual({ path: "b", before: undefined, after: 2 });
  });
});

describe("dryRun.formatDiff", () => {
  it("shows a friendly no-change line", () => {
    expect(formatDiff([])).toMatch(/no changes/);
  });

  it("prints path: before -> after", () => {
    const text = formatDiff([{ path: "roaming.aiRoamingEnable", before: true, after: false }]);
    expect(text).toContain("roaming.aiRoamingEnable");
    expect(text).toContain("true");
    expect(text).toContain("false");
    expect(text).toContain("->");
  });
});

describe("dryRun.actionPreview", () => {
  it("prefixes with DRY RUN in dry-run mode", () => {
    const text = actionPreview({
      action: "reboot",
      target: "EAP245",
      context: "status=0",
      dryRun: true,
    });
    expect(text).toMatch(/DRY RUN/);
    expect(text).toContain("reboot");
    expect(text).toContain("EAP245");
    expect(text).toContain("status=0");
    expect(text).toMatch(/dryRun: false/);
  });

  it("omits the DRY RUN prefix when applied", () => {
    const text = actionPreview({ action: "block", target: "client", dryRun: false });
    expect(text).not.toMatch(/^DRY RUN/);
    expect(text).toMatch(/Action requested/);
  });
});

describe("dryRun.statePreview", () => {
  it("renders proposed changes in dry-run mode", () => {
    const text = statePreview({
      what: "site roaming",
      target: "site-1",
      changes: [{ path: "fastRoamingEnable", before: true, after: false }],
      dryRun: true,
    });
    expect(text).toMatch(/DRY RUN/);
    expect(text).toContain("site roaming");
    expect(text).toContain("fastRoamingEnable");
  });
});

describe("dryRun.postApplyReport", () => {
  it("warns when controller-side overrides occurred", () => {
    const text = postApplyReport({
      what: "roaming",
      target: "site-1",
      before: { aiRoamingEnable: false, forceDisassociationEnable: true },
      proposed: { aiRoamingEnable: true, forceDisassociationEnable: true },
      // The controller silently flipped forceDisassociation off because AI was enabled.
      actual: { aiRoamingEnable: true, forceDisassociationEnable: false },
    });
    expect(text).toContain("Actual changes");
    expect(text).toContain("⚠");
    expect(text).toContain("overrode");
    expect(text).toContain("forceDisassociationEnable");
  });

  it("reports no warning when every proposed change applied", () => {
    const text = postApplyReport({
      what: "band steering",
      target: "site-1",
      before: { mode: 1 },
      proposed: { mode: 2 },
      actual: { mode: 2 },
    });
    expect(text).toContain("Actual changes");
    expect(text).not.toContain("⚠");
  });
});

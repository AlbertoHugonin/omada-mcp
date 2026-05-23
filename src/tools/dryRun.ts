/**
 * Helpers for the dry-run framework shared by every write tool.
 *
 * Two patterns:
 * - **Action endpoints** (POST .../reboot, .../block, ...) — no before/after
 *   state; dry-run just describes the action that would be taken.
 * - **State-mutation endpoints** (PATCH/PUT roaming, band-steering, etc.) —
 *   GET current state, compute proposed state, diff the two; dry-run returns
 *   the diff without sending the mutation; apply mode sends the mutation
 *   then re-reads to surface the *actual* resulting state (since the
 *   controller can silently override — see brief §5).
 */

export interface DiffEntry {
  path: string;
  before: unknown;
  after: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Walks two values and returns the field-by-field differences. */
export function diff(before: unknown, after: unknown, prefix = ""): DiffEntry[] {
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const out: DiffEntry[] = [];
    for (const key of keys) {
      const childPrefix = prefix ? `${prefix}.${key}` : key;
      out.push(...diff(before[key], after[key], childPrefix));
    }
    return out;
  }
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return [];
  }
  return [{ path: prefix || "(root)", before, after }];
}

/** Renders a list of diff entries as readable lines. */
export function formatDiff(changes: DiffEntry[]): string {
  if (changes.length === 0) {
    return "  (no changes — the proposed value matches current state)";
  }
  return changes
    .map((c) => `  ${c.path}:  ${JSON.stringify(c.before)} -> ${JSON.stringify(c.after)}`)
    .join("\n");
}

/** Preview text for an action endpoint (no state to diff). */
export function actionPreview(args: {
  action: string;
  target: string;
  context?: string;
  dryRun: boolean;
}): string {
  const head = args.dryRun
    ? `DRY RUN — would ${args.action} on ${args.target}.`
    : `Action requested: ${args.action} on ${args.target}.`;
  const ctx = args.context ? `\n${args.context}` : "";
  const trailer = args.dryRun ? "\nPass dryRun: false to apply." : "";
  return `${head}${ctx}${trailer}`;
}

/** Preview text for a state-mutation endpoint. */
export function statePreview(args: {
  what: string;
  target: string;
  changes: DiffEntry[];
  dryRun: boolean;
}): string {
  if (args.dryRun) {
    return [
      `DRY RUN — proposed change to ${args.what} on ${args.target}:`,
      formatDiff(args.changes),
      "",
      "Pass dryRun: false to apply. The actual post-apply state will be re-read",
      "and reported (the controller may silently override mutually-exclusive fields).",
    ].join("\n");
  }
  return [`Applied to ${args.what} on ${args.target}. Proposed:`, formatDiff(args.changes)].join(
    "\n",
  );
}

/** Renders the "re-read after apply" diff to flag controller-side overrides. */
export function postApplyReport(args: {
  what: string;
  target: string;
  before: unknown;
  actual: unknown;
  proposed: unknown;
}): string {
  const actualChanges = diff(args.before, args.actual);
  const proposedChanges = diff(args.before, args.proposed);
  const overridden = diff(args.proposed, args.actual);

  const lines = [
    `Post-apply state (${args.what} on ${args.target}):`,
    "",
    "Actual changes the controller accepted:",
    formatDiff(actualChanges),
  ];
  if (overridden.length > 0) {
    lines.push(
      "",
      "⚠ The controller overrode some of the requested changes",
      "(this often means a setting is mutually exclusive with another):",
      formatDiff(overridden),
    );
  } else if (actualChanges.length < proposedChanges.length) {
    lines.push("", "(All requested changes were accepted.)");
  }
  return lines.join("\n");
}

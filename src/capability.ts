export const CAPABILITY_PROFILES = ["safe-read", "ops-write", "admin"] as const;

export type CapabilityProfile = (typeof CAPABILITY_PROFILES)[number];

/** A tool's minimum required tier — drawn from the same set as the profiles. */
export type CapabilityTier = CapabilityProfile;

const RANK: Record<CapabilityProfile, number> = {
  "safe-read": 0,
  "ops-write": 1,
  admin: 2,
};

/**
 * True when a tool tagged with `tier` may run under the active `profile`.
 * Tools above the active profile are never registered with the MCP server,
 * so the assistant cannot see or call them.
 */
export function isToolAllowed(tier: CapabilityTier, profile: CapabilityProfile): boolean {
  return RANK[tier] <= RANK[profile];
}

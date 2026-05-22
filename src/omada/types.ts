import { z } from "zod";

/** Result of the OAuth2 client-credentials token endpoint. */
export const tokenResultSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.string().optional(),
  expiresIn: z.number(),
  refreshToken: z.string().optional(),
});
export type TokenResult = z.infer<typeof tokenResultSchema>;

/** A site as returned by `GET /openapi/v1/{omadacId}/sites`. */
export const siteSchema = z.object({
  siteId: z.string().min(1),
  name: z.string(),
  region: z.string().optional(),
  timeZone: z.string().optional(),
  scenario: z.string().optional(),
  type: z.number().optional(),
  primary: z.boolean().optional(),
});
export type Site = z.infer<typeof siteSchema>;

/** Wraps an item schema in the Open API paginated-list envelope. */
export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({
    totalRows: z.number().optional(),
    currentPage: z.number().optional(),
    currentSize: z.number().optional(),
    data: z.array(item),
  });
}

/**
 * Validates `data` against `schema`, returning the typed value. Throws a clear,
 * actionable error on mismatch — the early-warning system for controller
 * firmware drift or an Open API change.
 */
export function parseApiResult<T>(schema: z.ZodType<T>, data: unknown, context: string): T {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  const issues = result.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  throw new Error(
    `Unexpected response shape from ${context}. The controller may be running an ` +
      `untested firmware version, or the Open API changed. Validation errors:\n${issues}`,
  );
}

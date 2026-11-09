import "server-only";
import { z } from "zod";

/**
 * Server-side configuration, validated on first use (not at import time),
 * so `next build` works without production secrets present.
 */
const schema = z.object({
  CONFLUENCE_BASE_URL: z
    .string()
    .url()
    .transform((v) => v.replace(/\/+$/, "")),
  CONFLUENCE_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  // Required for normal sign-in; not needed in development mode (see dev-mode.ts).
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .optional()
    .refine((v) => !v || Buffer.from(v, "base64").length === 32, {
      message: "TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)",
    }),
  SESSION_MAX_AGE_DAYS: z.coerce.number().int().positive().default(30),
  REDIS_URL: z.string().optional().transform((v) => (v ? v : undefined)),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Invalid server configuration:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function tokenEncryptionKey(): string {
  const key = env().TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32");
  return key;
}

export const sessionMaxAgeSeconds = () => env().SESSION_MAX_AGE_DAYS * 24 * 60 * 60;

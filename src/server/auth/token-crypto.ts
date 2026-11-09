import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encrypts a user's Confluence personal access token for storage in an
 * httpOnly cookie. AES-256-GCM gives confidentiality and tamper detection.
 *
 * The payload is bound to the Okta user (`sub`), so a cookie copied into
 * another person's browser session is rejected.
 */

const VERSION = "v1";
const AAD = Buffer.from("confluence-portal-pat-v1");

export interface StoredToken {
  /** Confluence personal access token. */
  pat: string;
  /** Okta subject the token belongs to. */
  sub: string;
  /** Confluence username, shown in the UI. */
  username: string;
  /** Confluence display name, shown in the UI. */
  displayName: string;
  /** Expiry, seconds since epoch. */
  exp: number;
}

function keyFrom(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes");
  return key;
}

export function encryptToken(token: StoredToken, base64Key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(base64Key), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(token), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}.${Buffer.concat([iv, tag, ciphertext]).toString("base64url")}`;
}

/**
 * Returns the token, or null if the value is malformed, tampered with,
 * expired, or belongs to a different user.
 */
export function decryptToken(
  value: string | undefined,
  base64Key: string,
  expectedSub: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): StoredToken | null {
  if (!value) return null;
  const [version, data] = value.split(".", 2);
  if (version !== VERSION || !data) return null;
  try {
    const raw = Buffer.from(data, "base64url");
    if (raw.length < 12 + 16 + 1) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(base64Key), iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const token = JSON.parse(json) as StoredToken;
    if (token.sub !== expectedSub) return null;
    if (typeof token.exp !== "number" || token.exp <= nowSeconds) return null;
    if (typeof token.pat !== "string" || !token.pat) return null;
    return token;
  } catch {
    return null;
  }
}

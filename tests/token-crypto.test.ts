import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "@/server/auth/token-crypto";

const key = randomBytes(32).toString("base64");
const now = 1_800_000_000;
const token = { pat: "NjQ1MzExMDQ4NzQ0OmFiY2RlZg", sub: "okta-user-1", username: "jdoe", displayName: "Jane Doe", exp: now + 3600 };

describe("token encryption", () => {
  it("round-trips for the same user", () => {
    const value = encryptToken(token, key);
    expect(value).not.toContain(token.pat);
    expect(decryptToken(value, key, "okta-user-1", now)).toEqual(token);
  });

  it("rejects a cookie belonging to another user", () => {
    expect(decryptToken(encryptToken(token, key), key, "someone-else", now)).toBeNull();
  });

  it("rejects expired tokens", () => {
    expect(decryptToken(encryptToken(token, key), key, "okta-user-1", now + 3601)).toBeNull();
  });

  it("rejects tampered values and wrong keys", () => {
    const value = encryptToken(token, key);
    const tampered = value.slice(0, -2) + (value.endsWith("A") ? "BB" : "AA");
    expect(decryptToken(tampered, key, "okta-user-1", now)).toBeNull();
    expect(decryptToken(value, randomBytes(32).toString("base64"), "okta-user-1", now)).toBeNull();
    expect(decryptToken("garbage", key, "okta-user-1", now)).toBeNull();
    expect(decryptToken(undefined, key, "okta-user-1", now)).toBeNull();
  });
});

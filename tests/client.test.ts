import { describe, expect, it, vi } from "vitest";
import { ConfluenceClient, ConfluenceError, parseRetryAfter } from "@/server/confluence/client";

function makeClient(responses: Array<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  });
  const sleeps: number[] = [];
  const client = new ConfluenceClient({
    baseUrl: "https://confluence.example.com",
    timeoutMs: 1000,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep: async (ms) => void sleeps.push(ms),
  });
  return { client, calls, sleeps };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("ConfluenceClient", () => {
  it("sends the user's PAT as a bearer token", async () => {
    const { client, calls } = makeClient([json({ username: "jdoe" })]);
    await client.json("pat-123", "/rest/api/user/current");
    expect(calls[0].url).toBe("https://confluence.example.com/rest/api/user/current");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer pat-123");
  });

  it("waits for Retry-After on 429 and retries", async () => {
    const { client, calls, sleeps } = makeClient([json({}, 429, { "retry-after": "2" }), json({ ok: true })]);
    await expect(client.json("t", "/rest/api/space")).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([2000]);
  });

  it("retries GETs on 503 but never retries a PUT on 500", async () => {
    const get = makeClient([json({}, 503), json({ ok: 1 })]);
    await expect(get.client.json("t", "/rest/api/content/1")).resolves.toEqual({ ok: 1 });

    const put = makeClient([json({ message: "boom" }, 500)]);
    await expect(put.client.json("t", "/rest/api/content/1", { method: "PUT", json: {} })).rejects.toMatchObject({ status: 500 });
    expect(put.calls).toHaveLength(1);
    expect((put.calls[0].init.headers as Record<string, string>)["X-Atlassian-Token"]).toBe("no-check");
  });

  it("maps a login redirect to an auth error", async () => {
    const { client } = makeClient([new Response(null, { status: 302, headers: { location: "/login.action" } })]);
    const err = (await client.json("bad", "/rest/api/space").catch((e: unknown) => e)) as ConfluenceError;
    expect(err).toBeInstanceOf(ConfluenceError);
    expect(err.isAuthError).toBe(true);
  });

  it("reports 404 as not-found-or-forbidden with Confluence's message", async () => {
    const { client } = makeClient([json({ message: "No content found with id 9" }, 404)]);
    const err = (await client.json("t", "/rest/api/content/9").catch((e: unknown) => e)) as ConfluenceError;
    expect(err.isNotFoundOrForbidden).toBe(true);
    expect(err.message).toBe("No content found with id 9");
  });

  it("rejects path traversal and foreign hosts", () => {
    const { client } = makeClient([]);
    expect(() => client.buildUrl("//evil.com/x")).toThrow();
    expect(() => client.buildUrl("/rest/../admin")).toThrow();
    expect(() => client.buildUrl("rest/api")).toThrow();
    expect(() => client.buildUrl("/download/%2E%2E/rest/api")).toThrow();
  });

  it("parses Retry-After seconds and dates", () => {
    expect(parseRetryAfter("5")).toBe(5000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});

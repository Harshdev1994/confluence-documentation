import { createHash } from "node:crypto";

/**
 * Low-level Confluence Data Center REST client.
 *
 * - Authenticates every call with the *user's* personal access token, so
 *   Confluence enforces that user's own permissions.
 * - Retries rate-limited calls (429) using Retry-After, and retries safe
 *   (GET/HEAD) calls on transient 5xx and network errors with backoff.
 *   Confluence 10.2.11+ rate-limits /rest/api/content, so this matters.
 * - Limits concurrent requests per user so one browser can't burst.
 */

export class ConfluenceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ConfluenceError";
  }
  get isAuthError() {
    return this.status === 401;
  }
  /** Confluence returns 404 (not 403) for pages the user can't see. */
  get isNotFoundOrForbidden() {
    return this.status === 403 || this.status === 404;
  }
  get isConflict() {
    return this.status === 409;
  }
}

export interface ClientConfig {
  baseUrl: string;
  timeoutMs: number;
  maxRetries?: number;
  maxConcurrentPerUser?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "HEAD";
  query?: Record<string, string | number | boolean | undefined>;
  json?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Small per-key semaphore. */
class Limiter {
  private active = new Map<string, number>();
  private queues = new Map<string, Array<() => void>>();
  constructor(private readonly max: number) {}

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    await this.acquire(key);
    try {
      return await fn();
    } finally {
      this.release(key);
    }
  }
  private acquire(key: string): Promise<void> {
    const n = this.active.get(key) ?? 0;
    if (n < this.max) {
      this.active.set(key, n + 1);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const q = this.queues.get(key) ?? [];
      q.push(() => {
        this.active.set(key, (this.active.get(key) ?? 0) + 1);
        resolve();
      });
      this.queues.set(key, q);
    });
  }
  private release(key: string) {
    const n = (this.active.get(key) ?? 1) - 1;
    if (n <= 0) this.active.delete(key);
    else this.active.set(key, n);
    const q = this.queues.get(key);
    const next = q?.shift();
    if (q && q.length === 0) this.queues.delete(key);
    next?.();
  }
}

export function parseRetryAfter(value: string | null, nowMs = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - nowMs);
  return undefined;
}

export class ConfluenceClient {
  private readonly limiter: Limiter;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;

  constructor(private readonly config: ClientConfig) {
    this.limiter = new Limiter(config.maxConcurrentPerUser ?? 6);
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.sleep = config.sleep ?? defaultSleep;
    this.maxRetries = config.maxRetries ?? 3;
  }

  get baseUrl() {
    return this.config.baseUrl;
  }

  buildUrl(path: string, query?: RequestOptions["query"]): URL {
    if (!path.startsWith("/") || path.startsWith("//") || /\.\.|%2e%2e/i.test(path)) {
      throw new Error(`Invalid Confluence path: ${path}`);
    }
    const url = new URL(this.config.baseUrl + path);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    return url;
  }

  /** Sends a request and returns the raw Response (used for file streaming). */
  async raw(token: string | null, path: string, opts: RequestOptions = {}): Promise<Response> {
    const method = opts.method ?? "GET";
    const url = this.buildUrl(path, opts.query);
    const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
    if (token) headers.Authorization = `Bearer ${token}`;
    let body: string | undefined;
    if (opts.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.json);
    }
    if (method !== "GET" && method !== "HEAD") {
      // Required by Confluence for state-changing REST calls (XSRF check).
      headers["X-Atlassian-Token"] = "no-check";
    }
    const idempotent = method === "GET" || method === "HEAD";
    const limiterKey = token ? createHash("sha256").update(token).digest("hex").slice(0, 16) : "anonymous";

    return this.limiter.run(limiterKey, async () => {
      for (let attempt = 0; ; attempt++) {
        const signals = [AbortSignal.timeout(this.config.timeoutMs)];
        if (opts.signal) signals.push(opts.signal);
        let res: Response;
        try {
          res = await this.fetchImpl(url, {
            method,
            headers,
            body,
            redirect: "manual",
            signal: AbortSignal.any(signals),
          });
        } catch (err) {
          if (idempotent && attempt < this.maxRetries && !opts.signal?.aborted) {
            await this.sleep(this.backoff(attempt));
            continue;
          }
          throw new ConfluenceError(`Confluence unreachable: ${(err as Error).message}`, 0, path);
        }

        // 429 means the request was not processed, so any method is safe to retry.
        const retryable = res.status === 429 || (idempotent && [502, 503, 504].includes(res.status));
        if (retryable && attempt < this.maxRetries) {
          const wait = parseRetryAfter(res.headers.get("retry-after")) ?? this.backoff(attempt);
          await res.body?.cancel();
          await this.sleep(Math.min(wait, 30_000));
          continue;
        }
        return res;
      }
    });
  }

  /** Sends a request and parses JSON, throwing ConfluenceError on failure. */
  async json<T>(token: string | null, path: string, opts: RequestOptions = {}): Promise<T> {
    const res = await this.raw(token, path, opts);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let data: unknown = undefined;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (res.status >= 300) {
      // A 3xx usually means Confluence redirected an unauthenticated call to its login page.
      const status = res.status >= 300 && res.status < 400 ? 401 : res.status;
      const upstreamMessage =
        data && typeof data === "object" && "message" in data ? String((data as { message: unknown }).message) : "";
      const message = upstreamMessage || `Confluence request failed with status ${res.status}`;
      throw new ConfluenceError(message, status, path, data);
    }
    return data as T;
  }

  private backoff(attempt: number) {
    const base = 500 * 2 ** attempt;
    return base + Math.floor(Math.random() * base * 0.25);
  }
}

import "server-only";
import Redis from "ioredis";
import { env } from "@/server/env";

/**
 * Cache used to cut calls to Confluence. Nothing here is permanent:
 * if the cache is wiped, the app simply fetches from Confluence again.
 *
 * Uses Redis when REDIS_URL is set (required when running more than one
 * app instance), otherwise an in-memory cache for local development.
 * Cache failures are logged and treated as misses, never as errors.
 */
export interface CacheStore {
  readonly kind: "redis" | "memory";
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  /** Atomically increments a counter that never expires. */
  incr(key: string): Promise<number>;
  getNumber(key: string): Promise<number>;
}

const PREFIX = "cp:";

export class MemoryStore implements CacheStore {
  readonly kind = "memory" as const;
  private map = new Map<string, { value: unknown; expires: number }>();
  constructor(
    private readonly maxEntries = 5_000,
    private readonly now: () => number = Date.now,
  ) {}

  async get<T>(key: string) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    // Refresh recency for LRU eviction.
    this.map.delete(key);
    this.map.set(key, entry);
    return structuredClone(entry.value) as T;
  }
  async set(key: string, value: unknown, ttlSeconds: number) {
    this.map.delete(key);
    this.map.set(key, { value: structuredClone(value), expires: this.now() + ttlSeconds * 1000 });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
  async del(...keys: string[]) {
    for (const k of keys) this.map.delete(k);
  }
  async incr(key: string) {
    const current = (await this.get<number>(key)) ?? 0;
    await this.set(key, current + 1, 365 * 24 * 3600);
    return current + 1;
  }
  async getNumber(key: string) {
    return (await this.get<number>(key)) ?? 0;
  }
}

class RedisStore implements CacheStore {
  readonly kind = "redis" as const;
  constructor(private readonly redis: Redis) {}

  async get<T>(key: string) {
    try {
      const raw = await this.redis.get(PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : undefined;
    } catch (err) {
      console.warn("[cache] get failed", key, (err as Error).message);
      return undefined;
    }
  }
  async set(key: string, value: unknown, ttlSeconds: number) {
    try {
      await this.redis.set(PREFIX + key, JSON.stringify(value), "EX", Math.max(1, Math.round(ttlSeconds)));
    } catch (err) {
      console.warn("[cache] set failed", key, (err as Error).message);
    }
  }
  async del(...keys: string[]) {
    if (!keys.length) return;
    try {
      await this.redis.del(...keys.map((k) => PREFIX + k));
    } catch (err) {
      console.warn("[cache] del failed", (err as Error).message);
    }
  }
  async incr(key: string) {
    try {
      return await this.redis.incr(PREFIX + key);
    } catch (err) {
      console.warn("[cache] incr failed", key, (err as Error).message);
      return Date.now(); // still changes the generation, so stale entries are skipped
    }
  }
  async getNumber(key: string) {
    try {
      return Number((await this.redis.get(PREFIX + key)) ?? 0);
    } catch {
      return 0;
    }
  }
}

const globalForCache = globalThis as unknown as { __cpCache?: CacheStore; __cpRedis?: Redis };

export function getRedis(): Redis | undefined {
  const url = env().REDIS_URL;
  if (!url) return undefined;
  if (!globalForCache.__cpRedis) {
    const redis = new Redis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: false, lazyConnect: false });
    redis.on("error", (err) => console.warn("[cache] redis error", err.message));
    globalForCache.__cpRedis = redis;
  }
  return globalForCache.__cpRedis;
}

export function cache(): CacheStore {
  if (!globalForCache.__cpCache) {
    const redis = getRedis();
    globalForCache.__cpCache = redis ? new RedisStore(redis) : new MemoryStore();
  }
  return globalForCache.__cpCache;
}

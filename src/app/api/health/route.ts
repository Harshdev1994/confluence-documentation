import { cache } from "@/server/cache/store";

/** Liveness check for monitoring or a load balancer. Reveals nothing about Confluence. */
export async function GET() {
  return Response.json({ ok: true, cache: cache().kind });
}

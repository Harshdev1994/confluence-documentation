import type { NextRequest } from "next/server";
import { apiContext, apiError } from "@/server/auth/session";
import { getChildren } from "@/server/confluence/service";

/** GET /api/tree?space=KEY&parent=root|<pageId> → { nodes: TreeNode[] } */
export async function GET(req: NextRequest) {
  const ctx = await apiContext();
  if (ctx instanceof Response) return ctx;

  const space = req.nextUrl.searchParams.get("space") ?? "";
  const parent = req.nextUrl.searchParams.get("parent") ?? "root";
  if (!space || space.length > 255) return Response.json({ error: "bad_request" }, { status: 400 });
  if (parent !== "root" && !/^\d+$/.test(parent)) return Response.json({ error: "bad_request" }, { status: 400 });

  try {
    const nodes = await getChildren(ctx, space, parent);
    return Response.json({ nodes }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return apiError(err);
  }
}

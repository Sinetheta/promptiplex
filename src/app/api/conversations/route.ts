import { NextResponse } from "next/server";
import { listConversations } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Conversations, most recently used first — the order the sidebar reads in. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const spaceId = url.searchParams.get("spaceId");
  const limit = url.searchParams.get("limit");
  return NextResponse.json({
    conversations: listConversations({
      spaceId: spaceId ? Number(spaceId) : undefined,
      limit: limit ? Math.min(Number(limit), 200) : undefined,
    }),
  });
}

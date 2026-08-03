import { NextResponse } from "next/server";
import { listConversations } from "@/lib/db";
import { positiveInt } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 200;

/** Conversations, most recently used first — the order the sidebar reads in. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const spaceId = positiveInt(url.searchParams.get("spaceId"));
  const limit = positiveInt(url.searchParams.get("limit"));
  return NextResponse.json({
    conversations: listConversations({
      ...(spaceId === null ? {} : { spaceId }),
      ...(limit === null ? {} : { limit: Math.min(limit, MAX_LIMIT) }),
    }),
  });
}

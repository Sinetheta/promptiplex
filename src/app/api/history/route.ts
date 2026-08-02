import { NextResponse } from "next/server";
import { listQueries } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const spaceId = url.searchParams.get("spaceId");
  const limit = url.searchParams.get("limit");
  return NextResponse.json({
    queries: listQueries({
      spaceId: spaceId ? Number(spaceId) : undefined,
      limit: limit ? Math.min(Number(limit), 200) : undefined,
    }),
  });
}

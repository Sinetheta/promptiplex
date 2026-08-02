import { NextResponse } from "next/server";
import { getSpace } from "@/lib/db";
import { compile } from "@/lib/compile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dry run. Pure string assembly, no browser and no network, so the UI can call
 * this on every keystroke to show exactly what will be typed into Perplexity.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as { spaceId?: number; question?: string };

  const question = (body.question ?? "").trim();
  if (!question) {
    return NextResponse.json({ error: "Question is required" }, { status: 400 });
  }

  const space = body.spaceId ? getSpace(body.spaceId) : null;
  if (!space) {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  return NextResponse.json({ compiled: compile(space, question) });
}

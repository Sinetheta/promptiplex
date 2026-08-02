import { NextResponse } from "next/server";
import { deleteConversation, getConversation, listTurns } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** One conversation and its turns, oldest first. */
export async function GET(_req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const conversation = getConversation(id);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ conversation, turns: listTurns(id) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  deleteConversation(Number((await params).id));
  return NextResponse.json({ ok: true });
}

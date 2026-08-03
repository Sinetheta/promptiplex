import { NextResponse } from "next/server";
import { deleteConversation, getConversation, listTurns } from "@/lib/db";
import { positiveInt } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** One conversation and its turns, oldest first. */
export async function GET(_req: Request, { params }: Ctx) {
  const id = positiveInt((await params).id);
  if (id === null) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const conversation = getConversation(id);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ conversation, turns: listTurns(id) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const id = positiveInt((await params).id);
  if (id === null) {
    return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 });
  }
  deleteConversation(id);
  return NextResponse.json({ ok: true });
}

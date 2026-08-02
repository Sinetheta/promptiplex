import { NextResponse } from "next/server";
import { deleteSpace, getSpace, updateSpace } from "@/lib/db";
import { spaceInputSchema } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const space = getSpace(Number((await params).id));
  if (!space) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ space });
}

export async function PUT(req: Request, { params }: Ctx) {
  const parsed = spaceInputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid space", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const space = updateSpace(Number((await params).id), parsed.data);
  if (!space) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ space });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  deleteSpace(Number((await params).id));
  return NextResponse.json({ ok: true });
}

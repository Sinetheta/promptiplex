import { NextResponse } from "next/server";
import { createSpace, listSpaces } from "@/lib/db";
import { seedIfEmpty } from "@/lib/seed";
import { spaceInputSchema } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  seedIfEmpty();
  return NextResponse.json({ spaces: listSpaces() });
}

export async function POST(req: Request) {
  const parsed = spaceInputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid space", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  return NextResponse.json({ space: createSpace(parsed.data) }, { status: 201 });
}

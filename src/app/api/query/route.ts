import { NextResponse } from "next/server";
import { getSpace, recordQuery } from "@/lib/db";
import { compile } from "@/lib/compile";
import { foldFiltersIntoQuery, resolveProvider } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Compiles the space into a query, sends it to the configured provider, and
 * records what came back — including what the search cost, so the bill stays
 * visible next to the query that caused it.
 *
 * One request per user action. A failure is reported rather than retried.
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

  const compiled = compile(space, question);
  const started = Date.now();

  try {
    const provider = await resolveProvider();

    // A provider without native filtering gets the source preferences restated
    // in the query text, where they are a request rather than a constraint.
    const query = provider.appliesFiltersNatively
      ? compiled.text
      : foldFiltersIntoQuery(compiled.text, compiled.filters);

    const answer = await provider.search({ query, filters: compiled.filters });

    const result = {
      answer: answer.answerMarkdown,
      sources: answer.sources,
      images: answer.images,
      provider: provider.id,
      ...(answer.threadUrl ? { threadUrl: answer.threadUrl } : {}),
      ...(answer.usage ? { usage: answer.usage } : {}),
    };
    const withWarnings = {
      ...compiled,
      warnings: [...compiled.warnings, ...answer.warnings],
    };

    const id = recordQuery({
      spaceId: space.id,
      question,
      compiled: withWarnings,
      result,
      error: null,
      durationMs: Date.now() - started,
    });
    return NextResponse.json({
      id,
      compiled: withWarnings,
      result,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    const message = (err as Error).message;
    recordQuery({
      spaceId: space.id,
      question,
      compiled,
      result: null,
      error: message,
      durationMs: Date.now() - started,
    });
    return NextResponse.json({ error: message, compiled }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import {
  createConversation,
  getConversation,
  getSpace,
  listTurns,
  recordQuery,
  setConversationThread,
} from "@/lib/db";
import { compile, compileFollowUp } from "@/lib/compile";
import { foldFiltersIntoQuery, resolveProvider } from "@/lib/search";
import type { PriorTurn, SearchAnswer, SearchProvider } from "@/lib/search";
import type { CompiledQuery, Space } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Asks one question and records what came back — including what it cost, so the
 * bill stays visible next to the query that caused it.
 *
 * Two shapes, both one question:
 *
 *   { spaceId, question }        opens a conversation; the brief is compiled in
 *   { conversationId, question } continues one; the earlier turns carry the brief
 *
 * One request per user action. A failure is reported rather than retried.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    spaceId?: number;
    conversationId?: number;
    question?: string;
  };

  const question = (body.question ?? "").trim();
  if (!question) {
    return NextResponse.json({ error: "Question is required" }, { status: 400 });
  }

  return body.conversationId
    ? continueConversation(body.conversationId, question)
    : openConversation(body.spaceId, question);
}

async function openConversation(spaceId: number | undefined, question: string) {
  const space = spaceId ? getSpace(spaceId) : null;
  if (!space) {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  const conversation = createConversation({ spaceId: space.id, title: question });
  const compiled = compile(space, question);

  return run({
    space,
    conversationId: conversation.id,
    question,
    compiled,
    ask: (provider, query) => provider.search({ query, filters: compiled.filters }),
  });
}

async function continueConversation(conversationId: number, question: string) {
  const conversation = getConversation(conversationId);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const space = conversation.spaceId ? getSpace(conversation.spaceId) : null;
  if (!space) {
    return NextResponse.json(
      { error: "This conversation's space no longer exists, so it cannot be continued." },
      { status: 409 },
    );
  }

  // Only answered turns are replayed. A failed turn has no answer to send, and
  // resending its question would be asking it a second time.
  const turns: PriorTurn[] = listTurns(conversationId)
    .filter((t) => t.result)
    .map((t) => ({ question: t.question, answerMarkdown: t.result!.answer }));

  if (!turns.length) {
    return NextResponse.json(
      { error: "This conversation has no answered turn to follow up on." },
      { status: 409 },
    );
  }

  const compiled = compileFollowUp(space, question);

  return run({
    space,
    conversationId,
    question,
    compiled,
    ask: (provider, query) => {
      if (!provider.followUp) {
        throw new Error(
          `${provider.label} answers one question at a time and cannot continue a ` +
            "conversation. Ask this as a new search instead.",
        );
      }
      return provider.followUp({
        question: query,
        turns,
        filters: compiled.filters,
        ...(conversation.threadUrl ? { threadUrl: conversation.threadUrl } : {}),
      });
    },
  });
}

/**
 * The half both shapes share: resolve the provider, send, record, respond.
 * `ask` is the part that differs — a first question or a continuation.
 */
async function run(args: {
  space: Space;
  conversationId: number;
  question: string;
  compiled: CompiledQuery;
  ask: (provider: SearchProvider, query: string) => Promise<SearchAnswer>;
}) {
  const { space, conversationId, question, compiled } = args;
  const started = Date.now();

  try {
    const provider = await resolveProvider();

    // A provider without native filtering gets the source preferences restated
    // in the query text, where they are a request rather than a constraint.
    const query = provider.appliesFiltersNatively
      ? compiled.text
      : foldFiltersIntoQuery(compiled.text, compiled.filters);

    const answer = await args.ask(provider, query);

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

    const { id, turn } = recordQuery({
      spaceId: space.id,
      conversationId,
      question,
      compiled: withWarnings,
      result,
      error: null,
      durationMs: Date.now() - started,
    });
    setConversationThread(conversationId, {
      threadUrl: answer.threadUrl,
      provider: provider.id,
    });

    return NextResponse.json({
      id,
      conversationId,
      turn,
      compiled: withWarnings,
      result,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    const message = (err as Error).message;
    const { turn } = recordQuery({
      spaceId: space.id,
      conversationId,
      question,
      compiled,
      result: null,
      error: message,
      durationMs: Date.now() - started,
    });
    return NextResponse.json({ error: message, conversationId, turn, compiled }, { status: 502 });
  }
}

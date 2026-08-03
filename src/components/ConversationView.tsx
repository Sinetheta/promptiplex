"use client";

import { useState } from "react";
import { CompiledPreview } from "@/components/CompiledPreview";
import { ResultView } from "@/components/ResultView";
import { formatWhen } from "@/components/ui";
import type { QueryRecord } from "@/lib/types";

/**
 * One conversation, read top to bottom.
 *
 * Every turn shows what was actually sent, not just what was typed — the first
 * turn carries the Space's brief, later ones do not, and seeing that is the
 * point of the app. It is folded away by default so the answers stay readable.
 */
export function ConversationView({
  turns,
  pending,
}: {
  turns: QueryRecord[];
  /** A question that has been sent but not answered yet. */
  pending?: string | null;
}) {
  return (
    <div className="space-y-8">
      {turns.map((t) => (
        <Turn key={t.id} turn={t} />
      ))}

      {pending && (
        <section className="space-y-3">
          <Question text={pending} />
          <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">
            Searching… Perplexity is gathering and reading sources.
          </div>
        </section>
      )}
    </div>
  );
}

function Question({ text }: { text: string }) {
  return (
    <h2 className="text-[17px] font-semibold leading-snug tracking-tight">{text}</h2>
  );
}

function Turn({ turn }: { turn: QueryRecord }) {
  const [showSent, setShowSent] = useState(false);
  const carriesBrief = turn.compiled.parts.some((p) => p.label === "brief");

  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2">
        <Question text={turn.question} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <span>turn {turn.turn}</span>
        <span>·</span>
        <span>{formatWhen(turn.createdAt)}</span>
        <button
          onClick={() => setShowSent((v) => !v)}
          aria-expanded={showSent}
          aria-controls={`sent-${turn.id}`}
          className="underline underline-offset-2 hover:text-foreground"
        >
          {showSent ? "hide what was sent" : carriesBrief ? "sent with the brief" : "what was sent"}
        </button>
      </div>

      {showSent && (
        <div id={`sent-${turn.id}`}>
          <CompiledPreview compiled={turn.compiled} rawQuestion={turn.question} />
        </div>
      )}

      {turn.error ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500">
          {turn.error}
        </div>
      ) : turn.result ? (
        <div className="rounded-xl border border-border bg-surface-2 p-4 sm:p-5">
          <ResultView result={turn.result} />
        </div>
      ) : null}
    </section>
  );
}

"use client";

import { useState } from "react";
import type { CompiledQuery } from "@/lib/types";

const LABEL_STYLE: Record<string, string> = {
  brief: "bg-accent-soft text-accent",
  question: "border border-border text-foreground",
};

/**
 * Shows the exact query that will be submitted, broken into the pieces it was
 * assembled from. This is the premise of the app made visible: your context is
 * part of the query before the search chooses what to look at.
 *
 * Source preferences are shown separately because they are not part of the
 * query text — they travel as a filter the search applies itself.
 */
export function CompiledPreview({
  compiled,
  rawQuestion,
  busy,
}: {
  compiled: CompiledQuery;
  rawQuestion: string;
  busy?: boolean;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const changed = compiled.text.trim() !== rawQuestion.trim();

  return (
    <div className="rounded-xl border border-border bg-surface p-3.5 text-sm">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          Will submit
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] ${
            changed ? "bg-accent-soft text-accent" : "border border-border text-muted"
          }`}
        >
          {changed ? `${compiled.text.length} chars` : "unchanged"}
        </span>
        {busy && <span className="text-xs text-muted">compiling…</span>}
        <button
          onClick={() => setShowRaw((v) => !v)}
          className="ml-auto text-xs text-muted underline underline-offset-2 hover:text-foreground"
        >
          {showRaw ? "show parts" : "show raw"}
        </button>
      </div>

      {showRaw ? (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-2.5 font-mono text-[11px] leading-relaxed">
          {compiled.text}
        </pre>
      ) : (
        <div className="space-y-1.5">
          {compiled.parts.map((p, i) => (
            <div key={i} className="flex gap-2">
              <span
                className={`mt-0.5 h-fit shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] ${
                  LABEL_STYLE[p.label] ?? "border border-border text-muted"
                }`}
              >
                {p.label}
              </span>
              <span className="min-w-0 font-mono text-[12px] leading-relaxed break-words">
                {p.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {(compiled.filters.domainsAllow.length > 0 ||
        compiled.filters.domainsDeny.length > 0) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
            Source filter
          </span>
          {compiled.filters.domainsAllow.map((d) => (
            <span
              key={`a-${d}`}
              className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] text-accent"
            >
              {d}
            </span>
          ))}
          {compiled.filters.domainsDeny.map((d) => (
            <span
              key={`d-${d}`}
              className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted line-through"
            >
              {d}
            </span>
          ))}
        </div>
      )}

      {compiled.warnings.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {compiled.warnings.map((w, i) => (
            <li key={i} className="text-xs text-amber-600 dark:text-amber-400">
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

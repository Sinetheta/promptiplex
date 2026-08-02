"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { QueryResult } from "@/lib/types";

function hostOf(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ResultView({ result }: { result: QueryResult }) {
  return (
    <div className="space-y-6">
      <article className="prose-answer text-[15px]">
        <Markdown remarkPlugins={[remarkGfm]}>{result.answer}</Markdown>
      </article>

      {result.images.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            Images
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {result.images.map((img, i) => (
              <a
                key={i}
                href={img.origin_url ?? img.image_url}
                target="_blank"
                rel="noreferrer"
                className="group block overflow-hidden rounded-lg border border-border bg-surface"
              >
                {/* Remote hosts are arbitrary, so plain <img> avoids the loader allowlist. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.image_url}
                  alt=""
                  loading="lazy"
                  className="aspect-video w-full object-cover transition group-hover:opacity-85"
                />
              </a>
            ))}
          </div>
        </section>
      )}

      {result.sources.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            Sources · {result.sources.length}
          </h3>
          <ol className="space-y-1.5">
            {result.sources.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="font-mono text-[11px] text-muted">{i + 1}</span>
                <span className="min-w-0">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent underline-offset-2 hover:underline"
                  >
                    {s.title || s.url}
                  </a>
                  <span className="block text-[11px] text-muted">{hostOf(s.url)}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {(result.usage || result.threadUrl) && (
        <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-[11px] text-muted">
          {result.usage && (
            <>
              <span className="font-mono">{result.usage.model}</span>
              <span>
                {result.usage.inputTokens + result.usage.outputTokens} tokens
                {result.usage.searchQueries > 0 && `, ${result.usage.searchQueries} searches`}
              </span>
              {/* Shown per query so the running cost is never a surprise. */}
              {typeof result.usage.costUsd === "number" && (
                <span className="font-mono">${result.usage.costUsd.toFixed(4)}</span>
              )}
            </>
          )}
          {result.threadUrl && (
            <a
              href={result.threadUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Open this search
            </a>
          )}
        </footer>
      )}
    </div>
  );
}

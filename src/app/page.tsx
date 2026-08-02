"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CompiledPreview } from "@/components/CompiledPreview";
import { ResultView } from "@/components/ResultView";
import { SpaceEditor } from "@/components/SpaceEditor";
import { Button, TextArea } from "@/components/ui";
import type { CompiledQuery, QueryRecord, QueryResult, Space } from "@/lib/types";

type Pane = "ask" | "edit" | "new";

export default function Home() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [pane, setPane] = useState<Pane>("ask");

  const [question, setQuestion] = useState("");
  // Held with the question it was compiled from, so a stale preview is never
  // shown against newly typed text.
  const [preview, setPreview] = useState<{
    question: string;
    compiled: CompiledQuery;
  } | null>(null);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [sentCompiled, setSentCompiled] = useState<CompiledQuery | null>(null);
  const [sentQuestion, setSentQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<QueryRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const active = spaces.find((s) => s.id === activeId) ?? null;
  const livePreview = preview?.question === question ? preview : null;

  useEffect(() => {
    fetch("/api/spaces")
      .then((r) => r.json())
      .then((d: { spaces: Space[] }) => {
        setSpaces(d.spaces);
        setActiveId((cur) => cur ?? d.spaces[0]?.id ?? null);
      })
      .catch(() => setError("Could not load spaces."));
  }, []);

  const loadHistory = useCallback(() => {
    const qs = activeId ? `?spaceId=${activeId}` : "";
    fetch(`/api/history${qs}`)
      .then((r) => r.json())
      .then((d: { queries: QueryRecord[] }) => setHistory(d.queries))
      .catch(() => {});
  }, [activeId]);

  useEffect(() => {
    if (showHistory) loadHistory();
  }, [showHistory, loadHistory]);

  // Compilation is pure string assembly, so previewing on every keystroke is free.
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!question.trim() || !activeId) return;
    previewTimer.current = setTimeout(() => {
      fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeId, question }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.compiled) setPreview({ question, compiled: d.compiled });
        })
        .catch(() => {});
    }, 200);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [question, activeId]);

  async function ask() {
    if (!activeId || !question.trim() || running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setSentQuestion(question);
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: activeId, question }),
      });
      const d = await res.json();
      if (!res.ok) {
        setSentCompiled(d.compiled ?? null);
        throw new Error(d.error ?? "Query failed");
      }
      setResult(d.result);
      setSentCompiled(d.compiled);
      if (showHistory) loadHistory();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  function replay(rec: QueryRecord) {
    setShowHistory(false);
    setPane("ask");
    if (rec.spaceId) setActiveId(rec.spaceId);
    setQuestion(rec.question);
    setResult(rec.result);
    setSentCompiled(rec.compiled);
    setSentQuestion(rec.question);
    setError(rec.error);
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 lg:flex-row lg:p-6">
      <aside className="w-full shrink-0 lg:w-64">
        <div className="mb-4 flex items-baseline gap-2">
          <h1 className="text-lg font-semibold tracking-tight">Promptiplex</h1>
          <span className="text-xs text-muted">context before search</span>
        </div>

        <nav className="space-y-1">
          {spaces.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setActiveId(s.id);
                setPane("ask");
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                s.id === activeId ? "bg-accent-soft text-accent" : "hover:bg-surface"
              }`}
            >
              <span>{s.icon}</span>
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              {s.remoteSlug && (
                <span
                  title="Originally imported from Perplexity"
                  className="shrink-0 text-[10px] text-muted"
                >
                  ↗
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-3 space-y-1 border-t border-border pt-3">
          <button
            onClick={() => setPane("new")}
            className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-muted transition hover:bg-surface hover:text-foreground"
          >
            + New space
          </button>
          {active && (
            <button
              onClick={() => setPane("edit")}
              className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-muted transition hover:bg-surface hover:text-foreground"
            >
              Edit {active.name}
            </button>
          )}
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-muted transition hover:bg-surface hover:text-foreground"
          >
            {showHistory ? "Hide history" : "History"}
          </button>
        </div>

        {showHistory && (
          <ul className="mt-2 space-y-1">
            {history.length === 0 && (
              <li className="px-2.5 py-2 text-xs text-muted">Nothing yet.</li>
            )}
            {history.map((h) => (
              <li key={h.id}>
                <button
                  onClick={() => replay(h)}
                  className="w-full rounded-lg px-2.5 py-1.5 text-left transition hover:bg-surface"
                >
                  <span className="block truncate text-xs">{h.question}</span>
                  <span className="block text-[10px] text-muted">
                    {h.createdAt}
                    {h.error ? " · failed" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <main className="min-w-0 flex-1">
        {pane !== "ask" ? (
          <div className="mx-auto max-w-2xl">
            <h2 className="mb-4 text-base font-semibold">
              {pane === "new" ? "New space" : `Edit ${active?.name}`}
            </h2>
            <SpaceEditor
              key={pane === "edit" ? `edit-${active?.id}` : "new"}
              space={pane === "edit" ? active : null}
              onCancel={() => setPane("ask")}
              onSaved={(s) => {
                setSpaces((prev) =>
                  prev.some((p) => p.id === s.id)
                    ? prev.map((p) => (p.id === s.id ? s : p))
                    : [...prev, s],
                );
                setActiveId(s.id);
                setPane("ask");
              }}
              onDeleted={(id) => {
                setSpaces((prev) => prev.filter((p) => p.id !== id));
                setActiveId((cur) => (cur === id ? null : cur));
                setPane("ask");
              }}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <TextArea
                rows={3}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask();
                }}
                placeholder={
                  active
                    ? `Ask ${active.name} something…  (⌘↵ to search)`
                    : "Create a space to get started"
                }
                className="border-0 bg-transparent px-0 py-0 focus:ring-0"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
                <Button onClick={ask} disabled={!question.trim() || running || !active}>
                  {running ? "Searching…" : "Search"}
                </Button>
                <span className="text-xs text-muted">
                  one query, billed to your key
                </span>
              </div>
            </div>

            {livePreview && !result && (
              <CompiledPreview compiled={livePreview.compiled} rawQuestion={question} />
            )}

            {error && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500">
                <p>{error}</p>
                {error.includes("PERPLEXITY_API_KEY") && (
                  <p className="mt-1.5 text-xs opacity-80">
                    Copy <code className="font-mono">.env.example</code> to{" "}
                    <code className="font-mono">.env</code>, add your key, then restart
                    the dev server.
                  </p>
                )}
              </div>
            )}

            {running && (
              <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">
                Searching… Perplexity is gathering and reading sources.
              </div>
            )}

            {result && sentCompiled && (
              <div className="space-y-4">
                <CompiledPreview compiled={sentCompiled} rawQuestion={sentQuestion} />
                <div className="rounded-xl border border-border bg-surface-2 p-4 sm:p-5">
                  <ResultView result={result} />
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

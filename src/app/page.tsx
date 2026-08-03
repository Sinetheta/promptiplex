"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CompiledPreview } from "@/components/CompiledPreview";
import { ConversationView } from "@/components/ConversationView";
import { SpaceEditor } from "@/components/SpaceEditor";
import { Button, formatWhen, TextArea } from "@/components/ui";
import type { CompiledQuery, Conversation, QueryRecord, Space } from "@/lib/types";

type Pane = "ask" | "edit" | "new";

export default function Home() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [pane, setPane] = useState<Pane>("ask");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  // null means the next question opens a new conversation, which is also the
  // only state in which the Space's brief is compiled in.
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [turns, setTurns] = useState<QueryRecord[]>([]);

  const [question, setQuestion] = useState("");
  // Held with the question it was compiled from, so a stale preview is never
  // shown against newly typed text.
  const [preview, setPreview] = useState<{
    question: string;
    compiled: CompiledQuery;
  } | null>(null);

  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = spaces.find((s) => s.id === activeId) ?? null;
  const running = pending !== null;
  const isFollowUp = conversationId !== null;
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

  const loadConversations = useCallback(() => {
    const qs = activeId ? `?spaceId=${activeId}` : "";
    return fetch(`/api/conversations${qs}`)
      .then((r) => r.json())
      .then((d: { conversations: Conversation[] }) => setConversations(d.conversations))
      .catch(() => {});
  }, [activeId]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // Which conversation the pane is currently loading. Clicking B while A is
  // still in flight would otherwise let A's response land last and paint its
  // turns under B's heading, with no later render to correct it.
  const wanted = useRef<number | null>(null);

  const loadTurns = useCallback((id: number) => {
    wanted.current = id;
    return fetch(`/api/conversations/${id}`)
      .then((r) => r.json())
      .then((d: { turns?: QueryRecord[] }) => {
        if (wanted.current === id) setTurns(d.turns ?? []);
      })
      .catch(() => {});
  }, []);

  // Compilation is pure string assembly, so previewing on every keystroke is
  // free. Only the opening question has anything to preview — a follow-up is
  // sent as typed, with the conversation so far carrying the context.
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isFollowUp || !question.trim() || !activeId) return;
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
  }, [question, activeId, isFollowUp]);

  function startNew() {
    // Abandons any load still in flight, which would otherwise repopulate the
    // pane of the conversation being left.
    wanted.current = null;
    setConversationId(null);
    setTurns([]);
    setQuestion("");
    setError(null);
    setPane("ask");
  }

  function openConversation(c: Conversation) {
    setPane("ask");
    if (c.spaceId) setActiveId(c.spaceId);
    setConversationId(c.id);
    setQuestion("");
    setError(null);
    void loadTurns(c.id);
  }

  async function ask() {
    if (!question.trim() || running) return;
    if (!isFollowUp && !activeId) return;

    const asked = question;
    setPending(asked);
    setError(null);
    setQuestion("");

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isFollowUp ? { conversationId, question: asked } : { spaceId: activeId, question: asked },
        ),
      });
      const d = (await res.json()) as { conversationId?: number; error?: string };

      // A failed turn is recorded too, so the conversation exists either way and
      // is re-read from the database rather than patched up from the response.
      const id = d.conversationId ?? conversationId;
      if (id) {
        setConversationId(id);
        await loadTurns(id);
      }
      if (!res.ok) setError(d.error ?? "Query failed");
      await loadConversations();
    } catch (err) {
      setError((err as Error).message);
      setQuestion(asked);
    } finally {
      setPending(null);
    }
  }

  async function removeConversation(c: Conversation) {
    await fetch(`/api/conversations/${c.id}`, { method: "DELETE" }).catch(() => {});
    if (c.id === conversationId) startNew();
    await loadConversations();
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
                startNew();
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
        </div>

        <div className="mt-3 border-t border-border pt-3">
          <button
            onClick={startNew}
            className={`w-full rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-surface ${
              conversationId === null && pane === "ask"
                ? "text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            + New conversation
          </button>

          <ul className="mt-1 space-y-0.5">
            {conversations.length === 0 && (
              <li className="px-2.5 py-2 text-xs text-muted">
                Nothing asked in this space yet.
              </li>
            )}
            {conversations.map((c) => (
              <li key={c.id} className="group flex items-center gap-1">
                <button
                  onClick={() => openConversation(c)}
                  className={`min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-surface ${
                    c.id === conversationId ? "bg-surface" : ""
                  }`}
                >
                  <span className="block truncate text-xs">{c.title}</span>
                  <span className="block text-[10px] text-muted">
                    {c.turnCount} turn{c.turnCount === 1 ? "" : "s"} · {formatWhen(c.updatedAt)}
                  </span>
                </button>
                <button
                  onClick={() => void removeConversation(c)}
                  title="Delete this conversation"
                  aria-label={`Delete conversation: ${c.title}`}
                  className="shrink-0 rounded px-1.5 py-1 text-xs text-muted opacity-0 transition group-hover:opacity-100 hover:text-red-500 focus:opacity-100"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
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
                startNew();
              }}
              onDeleted={(id) => {
                setSpaces((prev) => prev.filter((p) => p.id !== id));
                setActiveId((cur) => (cur === id ? null : cur));
                startNew();
              }}
            />
          </div>
        ) : (
          <div className="space-y-6">
            {(turns.length > 0 || pending) && (
              <ConversationView turns={turns} pending={pending} />
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

            {livePreview && !isFollowUp && (
              <CompiledPreview compiled={livePreview.compiled} rawQuestion={question} />
            )}

            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <TextArea
                rows={3}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void ask();
                }}
                placeholder={
                  !active
                    ? "Create a space to get started"
                    : isFollowUp
                      ? "Ask a follow-up…  (⌘↵ to send)"
                      : `Ask ${active.name} something…  (⌘↵ to search)`
                }
                className="border-0 bg-transparent px-0 py-0 focus:ring-0"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
                <Button onClick={() => void ask()} disabled={!question.trim() || running || !active}>
                  {running ? "Searching…" : isFollowUp ? "Send" : "Search"}
                </Button>
                <span className="text-xs text-muted">
                  {isFollowUp
                    ? "one query, billed to your key — the brief is already in this conversation"
                    : "one query, billed to your key"}
                </span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

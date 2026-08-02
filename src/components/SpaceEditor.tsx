"use client";

import { useState } from "react";
import { Button, DomainList, Field, TextArea, TextInput } from "./ui";
import type { Space, SpaceInput } from "@/lib/types";

const BLANK: SpaceInput = {
  name: "",
  icon: "🔎",
  brief: "",
  queryTemplate: "{q}",
  domainsAllow: [],
  domainsDeny: [],
  remoteUuid: "",
  remoteSlug: "",
};

/** Drop the server-owned fields so the form holds only what is editable. */
function toInput(space: Space): SpaceInput {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = space;
  void _id;
  void _createdAt;
  void _updatedAt;
  return input;
}

/**
 * The caller passes a `key` tied to the space being edited, so switching
 * spaces remounts this with fresh state instead of syncing props in an effect.
 */
export function SpaceEditor({
  space,
  onSaved,
  onDeleted,
  onCancel,
}: {
  space: Space | null;
  onSaved: (s: Space) => void;
  onDeleted: (id: number) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<SpaceInput>(() => (space ? toInput(space) : BLANK));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof SpaceInput>(k: K, v: SpaceInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.name.trim()) {
      setError("Give the space a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(space ? `/api/spaces/${space.id}` : "/api/spaces", {
        method: space ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      onSaved(data.space);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!space) return;
    if (!confirm(`Delete the "${space.name}" space? Its past queries are kept.`)) return;
    await fetch(`/api/spaces/${space.id}`, { method: "DELETE" });
    onDeleted(space.id);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-[4.5rem_1fr] gap-3">
        <Field label="Icon">
          <TextInput
            value={form.icon}
            onChange={(e) => set("icon", e.target.value)}
            className="text-center text-lg"
          />
        </Field>
        <Field label="Name">
          <TextInput
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Minecraft"
          />
        </Field>
      </div>

      {form.remoteSlug && (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted">
          Originally imported from{" "}
          <a
            href={`https://www.perplexity.ai/projects/${form.remoteSlug}`}
            target="_blank"
            rel="noreferrer"
            className="text-accent underline underline-offset-2"
          >
            a Perplexity space
          </a>
          . It is yours now — edits here stay local, and re-importing leaves it
          alone.
        </p>
      )}

      <Field
        label="Brief"
        hint="Your standing context. Prefixed to every query so Perplexity has it before it searches."
      >
        <TextArea
          rows={6}
          value={form.brief}
          onChange={(e) => set("brief", e.target.value)}
          placeholder="I play Minecraft Java Edition 1.21 in survival mode…"
        />
      </Field>

      <Field
        label="Query template"
        hint="{q} is replaced with your question."
      >
        <TextInput
          value={form.queryTemplate}
          onChange={(e) => set("queryTemplate", e.target.value)}
          placeholder="Minecraft Java Edition 1.21 survival: {q}"
          className="font-mono text-xs"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Prefer sources" hint="Applied as a filter. Up to 10 in total.">
          <DomainList
            value={form.domainsAllow}
            onChange={(v) => set("domainsAllow", v)}
            placeholder="minecraft.wiki"
          />
        </Field>
        <Field label="Avoid sources">
          <DomainList
            value={form.domainsDeny}
            onChange={(v) => set("domainsDeny", v)}
            placeholder="pinterest.com"
          />
        </Field>
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : space ? "Save space" : "Create space"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {space && (
          <Button variant="danger" onClick={remove} className="ml-auto">
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

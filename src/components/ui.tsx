"use client";

import type { ReactNode } from "react";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium tracking-wide uppercase text-muted">
        {label}
      </span>
      {hint && <span className="block text-xs text-muted mt-0.5">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const inputBase =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none " +
  "focus:border-accent focus:ring-2 focus:ring-accent/20 transition";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`${inputBase} resize-y leading-relaxed ${props.className ?? ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${inputBase} ${props.className ?? ""}`} />
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
}) {
  const styles = {
    primary:
      "bg-accent text-background hover:opacity-90 disabled:opacity-40 font-medium",
    ghost:
      "border border-border bg-surface-2 hover:bg-surface disabled:opacity-40",
    danger:
      "border border-red-500/40 text-red-500 hover:bg-red-500/10 disabled:opacity-40",
  }[variant];
  return (
    <button
      {...props}
      className={`rounded-lg px-3 py-2 text-sm transition disabled:cursor-not-allowed ${styles} ${className}`}
    />
  );
}

/**
 * SQLite writes timestamps as UTC `YYYY-MM-DD HH:MM:SS[.mmm]`, which is neither
 * a date a browser parses nor one worth reading. Rendered in local time, and
 * relatively while it is still recent, which is when it is actually useful.
 */
export function formatWhen(stamp: string): string {
  const at = new Date(`${stamp.replace(" ", "T")}Z`);
  if (Number.isNaN(at.getTime())) return stamp;

  const seconds = (Date.now() - at.getTime()) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86_400) return `${Math.floor(seconds / 86_400)}d ago`;

  // The year is only omitted while it cannot be ambiguous. Without this, last
  // March and this March both read "3 Mar" and the list order is the only thing
  // telling them apart.
  const sameYear = at.getFullYear() === new Date().getFullYear();
  return at.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Comma/newline separated list editor, rendered back as chips. */
export function DomainList({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <TextInput
        value={value.join(", ")}
        placeholder={placeholder}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(/[,\n]/)
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
      />
      {value.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {value.map((d) => (
            <span
              key={d}
              className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px]"
            >
              {d}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

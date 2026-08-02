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

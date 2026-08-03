import { z } from "zod";
import { spaceInputSchema, type Space, type SpaceInput } from "./types";

/**
 * The file format a space review hands back: edits to existing spaces, each
 * one naming the space it was written against.
 *
 * A review reads every space, thinks about the wording, and proposes new
 * wording. That proposal has to survive being read by a human before anything
 * is written, so it is a file rather than a sequence of commands — one artifact
 * to approve, apply, and keep. `scripts/spaces.mts` applies it.
 *
 * Everything here is pure. Reading and writing spaces is the script's job.
 */

/**
 * Validates the fields an edit is allowed to touch.
 *
 * `.strict()` matters more than it looks: a plan is usually written by
 * something that has read the field names once, and a near-miss like
 * `template` for `queryTemplate` would otherwise be dropped in silence and
 * reported as applied.
 */
const editSchema = spaceInputSchema.partial().strict();

export const spacePlanSchema = z.object({
  changes: z
    .array(
      z.object({
        id: z.number().int().positive(),

        /**
         * The space's name when the plan was written. Spaces are edited in the
         * web UI too, and a review can sit unapplied for a while, so this is
         * how a plan notices it is describing something that has since moved.
         */
        expect: z.string().optional(),

        /** Why the edit was proposed. Never written to the database; it is for the reader. */
        why: z.string().optional(),

        /**
         * Kept unparsed so the merge can tell "absent" from "present". The
         * fields are validated against `editSchema` in `applyEdit`.
         */
        set: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1),
});

export type SpacePlan = z.infer<typeof spacePlanSchema>;
export type SpaceChange = SpacePlan["changes"][number];

const EDITABLE = Object.keys(spaceInputSchema.shape) as (keyof SpaceInput)[];

/** How each field is named in output, where the UI's word differs from the schema's. */
const LABELS: Record<string, string> = {
  queryTemplate: "template",
  domainsAllow: "prefer",
  domainsDeny: "avoid",
};

export function label(field: string): string {
  return LABELS[field] ?? field;
}

export function parsePlan(raw: unknown): SpacePlan {
  const parsed = spacePlanSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Not a usable plan:\n${issues}`);
  }
  return parsed.data;
}

/** Drops the fields the database owns, leaving what a plan may edit. */
export function toInput(space: Space): SpaceInput {
  const { id: _id, createdAt: _created, updatedAt: _updated, ...input } = space;
  void _id;
  void _created;
  void _updated;
  return input;
}

/**
 * The space as the change would leave it.
 *
 * Only keys the plan actually wrote are merged. The validated output of
 * `editSchema` cannot be used for this: the schema fills defaults for absent
 * fields, so an edit that mentioned only `brief` would arrive carrying
 * `queryTemplate: "{q}"` and quietly discard the space's template.
 */
export function applyEdit(space: Space, change: SpaceChange): SpaceInput {
  if (change.expect !== undefined && change.expect !== space.name) {
    throw new Error(
      `Space ${space.id} is now "${space.name}", but the plan was written against ` +
        `"${change.expect}". Re-read the spaces and write the plan again.`,
    );
  }

  const checked = editSchema.safeParse(change.set);
  if (!checked.success) {
    const issues = checked.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Space ${space.id} ("${space.name}") has an unusable edit:\n${issues}`);
  }

  const merged = toInput(space);
  for (const field of EDITABLE) {
    if (field in change.set) {
      (merged as Record<string, unknown>)[field] = checked.data[field];
    }
  }
  return spaceInputSchema.parse(merged);
}

export type FieldChange = { field: keyof SpaceInput; before: unknown; after: unknown };

/** The fields an edit would actually move, so an unchanged field is not reported as one. */
export function describeEdit(before: SpaceInput, after: SpaceInput): FieldChange[] {
  return EDITABLE.filter(
    (f) => JSON.stringify(before[f]) !== JSON.stringify(after[f]),
  ).map((field) => ({ field, before: before[field], after: after[field] }));
}

/**
 * The change that puts a space back, given the edit about to be applied.
 *
 * Spaces are the part of this app a user has actually written, and a review
 * rewrites them wholesale. Handing back the previous wording as a plan makes
 * undo the same operation as apply rather than a restore from memory.
 */
export function rollbackFor(space: Space, after: SpaceInput): SpaceChange | null {
  const before = toInput(space);
  const moved = describeEdit(before, after);
  if (!moved.length) return null;

  const set: Record<string, unknown> = {};
  for (const { field } of moved) set[field] = before[field];

  return {
    id: space.id,
    expect: after.name,
    why: `Restores ${moved.map((m) => label(m.field)).join(", ")} as it was before the review.`,
    set,
  };
}

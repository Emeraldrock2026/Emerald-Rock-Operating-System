// Structured client field rules: configurable options, list parsing and review prompts.
export const OPTION_FIELDS = [["regions", "Regions"], ["sectors", "Sectors"], ["client_type", "Client type"]] as const;
export type OptionField = (typeof OPTION_FIELDS)[number][0];

export function parseList(value: string | undefined): string[] {
  return (value ?? "").split(",").map((v) => v.trim()).filter(Boolean);
}

export function joinList(values: readonly string[]): string {
  return values.map((v) => v.trim()).filter(Boolean).join(", ");
}

// Values stored on the client that are not in the current option list need mapping,
// not silent deletion: they are preserved and flagged until someone re-maps them.
export function unmappedValues(selected: readonly string[], options: readonly string[]): string[] {
  return selected.filter((v) => !options.includes(v));
}

export function nextActionDone(profile: Record<string, string>): boolean {
  return profile["next_action_done"] === "done";
}

// A prospect with live projects is a data-quality prompt, never an automatic status change.
export function prospectReviewNeeded(status: string | undefined, liveCount: number): boolean {
  return (status ?? "prospect") === "prospect" && liveCount > 0;
}

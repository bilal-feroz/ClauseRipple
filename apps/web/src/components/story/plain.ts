// Plain-language wording for the story view. Everything shown is derived from real API data;
// these helpers only turn graph terms into sentences a first-time viewer understands.

import type { DiffLine, Verdict } from "@/lib/types";

export const TOOL_PLAIN: Record<string, string> = {
  inspect_change: "Reading what changed",
  trace_vendor_dependents: "Finding our systems that use ModelCloud",
  find_impacted_customers: "Finding customers who rely on those systems",
  get_customer_obligations: "Reading customer contracts",
  evaluate_residency: "Checking each customer's contract",
  recall_related_decisions: "Looking up past decisions",
  find_owner: "Finding who owns the system",
  get_source_evidence: "Collecting the proof",
  create_impact_case: "Opening a case",
  assign_impact_case: "Assigning it to the owner",
};

const REGION_NAMES: Record<string, string> = { UAE: "UAE", EU: "Europe (EU)", US: "United States" };

export function regionName(code: string): string {
  return REGION_NAMES[code] ?? code;
}

export function listRegions(codes: string[]): string {
  const names = codes.map((c) => (c === "EU" ? "EU" : c));
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Region codes mentioned in the removed / added diff lines, e.g. "(UAE)", "(EU)", "(US)". */
export function regionsInDiff(diff: DiffLine[]): { before: string[]; after: string[] } {
  const codes = (kind: DiffLine["kind"]) => {
    const found = new Set<string>();
    for (const l of diff.filter((d) => d.kind === kind)) {
      for (const m of l.text.matchAll(/\((UAE|EU|US)\)/g)) found.add(m[1]);
    }
    return [...found];
  };
  return { before: codes("del"), after: codes("add") };
}

export type PlainVerdict = { label: string; tone: "impact" | "safe" | "neutral" | "pending"; reason: string };

export function plainVerdict(v: Verdict, updated: boolean, added: string[], vendor = "ModelCloud"): PlainVerdict {
  if (v.affected) {
    return {
      label: v.severity === "CRITICAL" ? "Critical" : "High",
      tone: "impact",
      reason: `${listRegions(v.violating_regions)} not allowed — contract says ${listRegions(v.allowed_regions)} only`,
    };
  }
  if (v.status === "NO_DEPENDENCY") return { label: "Not affected", tone: "safe", reason: `Doesn't use ${vendor} at all` };
  if (updated && added.length) {
    return { label: "No impact", tone: "safe", reason: `Its contract allows ${listRegions(added)}` };
  }
  return { label: "OK", tone: "safe", reason: `Compliant — contract allows ${listRegions(v.allowed_regions)}` };
}

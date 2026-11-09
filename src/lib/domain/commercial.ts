/** Commercial values: agreed fee (GBP, 2dp) and budget hours (2dp). Empty means "not set". */
export type CommercialInput = { agreed_fee: number | null; budget_hours: number | null };

function parseAmount(raw: string, label: string, max: number): number | null {
  const s = raw.replace(/[£,\s]/g, "");
  if (s === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error(`${label} must be a positive number with up to 2 decimal places.`);
  const n = Number(s);
  if (n > max) throw new Error(`${label} is too large.`);
  return n;
}

export function parseCommercialInput(fee: string, hours: string): CommercialInput {
  return {
    agreed_fee: parseAmount(fee, "Agreed fee", 999_999_999.99),
    budget_hours: parseAmount(hours, "Budget hours", 999_999.99),
  };
}

/** Implied hourly rate, or null when it can't be worked out. */
export function impliedRate(c: CommercialInput): number | null {
  if (c.agreed_fee == null || !c.budget_hours) return null;
  return Math.round((c.agreed_fee / c.budget_hours) * 100) / 100;
}

export function formatGBP(n: number | null): string {
  return n == null ? "Not set" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}

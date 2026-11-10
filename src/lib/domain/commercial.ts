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

/* ---------- Commercial forecast (dashboard stage 4) ---------- */
export interface PendingChange { id: string; status: string; is_closed: boolean; estimate: number | null }
/** A change counts as pending exposure until it is closed or withdrawn. */
export const isPendingChange = (c: Pick<PendingChange, "status" | "is_closed">) => !c.is_closed && c.status !== "withdrawn";

export interface CommercialForecast {
  budget: number | null; forecast: number | null;
  /** Forecast minus budget; positive means the forecast is above the agreed fee. Null when either is missing. */
  variance: number | null; variancePct: number | null;
  pendingCount: number; pendingExposure: number; unestimated: number;
  /** Forecast plus estimated pending changes, only when a forecast exists. */
  forecastWithPending: number | null;
}
export function commercialForecast(budget: number | null, forecast: number | null, changes: readonly PendingChange[]): CommercialForecast {
  const pending = changes.filter(isPendingChange);
  const pendingExposure = Math.round(pending.reduce((s, c) => s + (c.estimate ?? 0), 0) * 100) / 100;
  const variance = budget != null && forecast != null ? Math.round((forecast - budget) * 100) / 100 : null;
  return {
    budget, forecast, variance,
    variancePct: variance != null && budget ? Math.round((variance / budget) * 1000) / 10 : null,
    pendingCount: pending.length, pendingExposure,
    unestimated: pending.filter((c) => c.estimate == null).length,
    forecastWithPending: forecast != null ? Math.round((forecast + pendingExposure) * 100) / 100 : null,
  };
}
/** Money for the forecast card: never shows £0.00 for a missing forecast. */
export function forecastText(n: number | null): string {
  return n == null ? "Forecast not entered" : formatGBP(n);
}
export function parseMoney(raw: string, label: string): number | null {
  const s = raw.replace(/[£,\s]/g, "");
  if (s === "") return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new Error(`${label} must be a number with up to 2 decimal places.`);
  const n = Number(s);
  if (Math.abs(n) > 999_999_999.99) throw new Error(`${label} is too large.`);
  return n;
}

import { z } from "zod";
import { DEFAULT_WEIGHTS, weightsSchema, type HealthWeights } from "./health";

export const WIDGETS = ["health", "live", "milestones", "commercial", "summary", "details"] as const;
export type Widget = typeof WIDGETS[number];
export const WIDGET_LABELS: Record<Widget, string> = { health: "Project health", live: "Register metrics and charts", milestones: "Milestones", commercial: "Commercial forecast", summary: "Project summary and activity", details: "Project details" };
export const TONES = ["red", "amber", "green", "neutral"] as const;
export type StatusTone = typeof TONES[number];
export const dashboardSettingsSchema = z.object({
  widgets: z.array(z.enum(WIDGETS)).max(WIDGETS.length).refine((v) => new Set(v).size === v.length, "Widgets must not repeat."),
  statusMappings: z.record(z.string().min(1).max(80), z.record(z.string().min(1).max(80), z.enum(TONES))),
  weights: weightsSchema,
  freshness: z.object({ milestones: z.number().int().min(1).max(365), commercial: z.number().int().min(1).max(365) }).strict(),
}).strict();
export type DashboardSettings = z.infer<typeof dashboardSettingsSchema>;
export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = { widgets: [...WIDGETS], statusMappings: {}, weights: DEFAULT_WEIGHTS, freshness: { milestones: 28, commercial: 28 } };
export function resolveHealthWeights(settings: DashboardSettings, override: HealthWeights | null, inherit = false) { return override && !inherit ? weightsSchema.parse(override) : settings.weights; }
/** Display mapping never changes register closure, QA outcomes, access or critical overrides. */
export function mappedStatusTone(module: string, status: string, settings: DashboardSettings): StatusTone | null { return settings.statusMappings[module]?.[status] ?? null; }
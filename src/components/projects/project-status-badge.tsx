import { StatusBadge } from "@/components/app/status-badge";
import { PROJECT_STATUS_LABEL, type ProjectStatus } from "@/lib/domain/projects";

const TONE = { draft: "pending", active: "ok", on_hold: "paused", completed: "off", archived: "off" } as const;

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <StatusBadge tone={TONE[status]}>{PROJECT_STATUS_LABEL[status]}</StatusBadge>;
}

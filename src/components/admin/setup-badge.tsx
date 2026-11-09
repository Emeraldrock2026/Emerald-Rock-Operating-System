import { StatusBadge } from "@/components/app/status-badge";
import { SETUP_STAGE_LABEL, setupStage, type TenantSetupFacts } from "@/lib/domain/tenant-setup";

export function SetupBadge({ facts }: { facts: TenantSetupFacts }) {
  const stage = setupStage(facts);
  const tone = stage === "ready" ? "ok" : stage === "suspended" ? "paused" : "pending";
  return <StatusBadge tone={tone}>{SETUP_STAGE_LABEL[stage]}</StatusBadge>;
}

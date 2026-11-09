import { CheckCircle2, CircleDashed, PauseCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "ok" | "pending" | "paused" | "off";

const TONE: Record<Tone, { icon: typeof CheckCircle2; className: string }> = {
  ok: { icon: CheckCircle2, className: "bg-success-surface text-success" },
  pending: { icon: CircleDashed, className: "bg-muted text-muted-foreground" },
  paused: { icon: PauseCircle, className: "bg-warning-surface text-warning-foreground" },
  off: { icon: XCircle, className: "bg-muted text-muted-foreground" },
};

/** Status shown with an icon and words, never colour alone. */
export function StatusBadge({ tone, children }: { tone: Tone; children: string }) {
  const { icon: Icon, className } = TONE[tone];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium", className)}>
      <Icon className="size-3.5" aria-hidden />
      {children}
    </span>
  );
}

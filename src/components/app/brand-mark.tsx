import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("text-sm font-semibold tracking-tight", className)}>
      Emerald Rock <span className="font-mono text-xs font-medium opacity-80">OS</span>
    </span>
  );
}

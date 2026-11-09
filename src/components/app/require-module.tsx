import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { MODULES, type ModuleId } from "@/lib/domain/modules";
import { useTenant } from "@/lib/use-tenant";

/**
 * Wrap every module page in this, so a direct link to a switched-off module
 * shows a plain message. The database refuses the data regardless.
 */
export function RequireModule({ module, children }: { module: ModuleId; children: ReactNode }) {
  const { ctx, tenantId } = useTenant();
  if (ctx.enabledModules.includes(module)) return <>{children}</>;
  return (
    <div className="max-w-lg rounded-lg border border-border bg-card p-6">
      <h1 className="text-lg font-semibold text-foreground">{MODULES[module].name} isn't switched on</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This part of Emerald Rock OS isn't available for your business. Ask the platform administrator if you need it.
      </p>
      <Button asChild className="mt-4">
        <Link to="/t/$tenantId" params={{ tenantId }}>Back to overview</Link>
      </Button>
    </div>
  );
}

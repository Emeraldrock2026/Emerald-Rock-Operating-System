import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BrandMark } from "@/components/app/brand-mark";
import { Button } from "@/components/ui/button";
import { signOut } from "@/components/app/sign-out";
import { ENVIRONMENT_LABEL } from "@/lib/labels";

/** Layout for platform administration. Deliberately separate from any business's workspace. */
export function AdminFrame({ email, children }: { email: string; children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return (
    <div className="min-h-screen bg-muted">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="text-primary">
              <BrandMark />
            </Link>
            <span className="rounded bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              Platform administration
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{email}</span>
            <Button asChild variant="ghost" size="sm">
              <Link to="/select-business" search={{ choose: "1" }}>
                My businesses
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => signOut(queryClient, navigate)}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <p className="pb-6 text-center font-mono text-xs text-muted-foreground">{ENVIRONMENT_LABEL}</p>
    </div>
  );
}

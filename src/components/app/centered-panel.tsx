import type { ReactNode } from "react";
import { BrandMark } from "./brand-mark";
import { ENVIRONMENT_LABEL } from "@/lib/labels";

/** Single centred card used by sign-in, password and access pages. */
export function CenteredPanel({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted px-4 py-10">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-card">
        <BrandMark className="text-primary" />
        <h1 className="mt-5 text-2xl font-semibold text-foreground">{title}</h1>
        {description ? <div className="mt-2 text-sm text-muted-foreground">{description}</div> : null}
        {children ? <div className="mt-6">{children}</div> : null}
      </div>
      <p className="mt-4 font-mono text-xs text-muted-foreground">{ENVIRONMENT_LABEL}</p>
    </main>
  );
}

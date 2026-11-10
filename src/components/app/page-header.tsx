import type { ReactNode } from "react";

export function PageHeader({ title, description, status, actions, breadcrumb }: {
  title: string;
  description?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <header className="mb-5">
      {breadcrumb ? <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted-foreground">{breadcrumb}</nav> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {status ? <div className="flex flex-wrap items-center gap-1.5">{status}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </header>
  );
}

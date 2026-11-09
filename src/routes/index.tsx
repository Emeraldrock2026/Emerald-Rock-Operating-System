import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Emerald Rock OS — Setting up" },
      {
        name: "description",
        content: "Emerald Rock OS is being set up. Sign-in opens once the database is connected.",
      },
      { property: "og:title", content: "Emerald Rock OS" },
      {
        property: "og:description",
        content: "Projects, people and resource planning for construction consultancies.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-card">
        <p className="text-sm font-semibold tracking-tight text-primary">Emerald Rock OS</p>
        <h1 className="mt-4 text-2xl font-semibold text-foreground">Setting up</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The database isn't connected yet, so sign-in isn't available. This page will be
          replaced by the sign-in screen once setup is complete.
        </p>
        <p className="mt-6 inline-flex items-center gap-2 rounded border border-border px-2 py-1 font-mono text-xs text-muted-foreground">
          Environment: Development
        </p>
      </div>
    </main>
  );
}

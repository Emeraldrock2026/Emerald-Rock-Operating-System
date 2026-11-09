import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CenteredPanel } from "@/components/app/centered-panel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Emerald Rock OS" },
      { name: "description", content: "Sign in to Emerald Rock OS to manage projects, people and planned resources." },
      { property: "og:title", content: "Emerald Rock OS" },
      { property: "og:description", content: "Projects, people and resource planning for construction consultancies." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) navigate({ to: "/select-business", search: { choose: undefined }, replace: true });
      else navigate({ to: "/auth", search: { redirect: undefined }, replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);
  return <CenteredPanel title="Opening…" description="Checking whether you're signed in." />;
}

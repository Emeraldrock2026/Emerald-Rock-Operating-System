import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapQuery } from "@/lib/session";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location, context }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    const user = data.user;
    // People who arrived through an invitation link must choose a password before continuing.
    if (user.invited_at && !user.user_metadata?.["password_set"]) {
      throw redirect({ to: "/reset-password", search: { welcome: "1" } });
    }
    await context.queryClient.ensureQueryData(bootstrapQuery(user.id));
    return { user: { id: user.id, email: user.email ?? "" } };
  },
  component: () => <Outlet />,
});

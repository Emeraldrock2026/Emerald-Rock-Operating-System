import type { QueryClient } from "@tanstack/react-query";
import type { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export async function signOut(queryClient: QueryClient, navigate: ReturnType<typeof useNavigate>) {
  await queryClient.cancelQueries();
  queryClient.clear();
  await supabase.auth.signOut();
  navigate({ to: "/auth", search: { redirect: undefined }, replace: true });
}

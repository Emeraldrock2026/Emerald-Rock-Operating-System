import { getRouteApi } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { tenantContextQuery } from "@/lib/session";

const tenantRoute = getRouteApi("/_authenticated/t/$tenantId");

/** Active business, membership and permissions for pages inside /t/$tenantId. */
export function useTenant() {
  const { tenantId } = tenantRoute.useParams();
  const { user } = tenantRoute.useRouteContext();
  const { data } = useSuspenseQuery(tenantContextQuery(tenantId, user.id));
  return { tenantId, user, ctx: data };
}

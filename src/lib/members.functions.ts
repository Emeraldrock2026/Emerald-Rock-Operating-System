import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inviteSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["owner_admin", "resource_manager", "employee"]),
});

/**
 * Invites a person to a business. New people get an invitation email with a link to set their
 * password; people who already have a login are added and see the business next time they sign in.
 */
export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof inviteSchema>) => inviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [admin, platform] = await Promise.all([
      supabase.rpc("is_tenant_admin", { _tenant: data.tenantId }),
      supabase.rpc("is_platform_admin"),
    ]);
    if (admin.error) throw new Error(admin.error.message);
    if (platform.error) throw new Error(platform.error.message);
    if (!admin.data && !(platform.data && data.role === "owner_admin")) {
      throw new Error("NOT_AUTHORISED: only an Owner/Admin can invite people");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const lookup = await supabaseAdmin.rpc("auth_user_id_by_email", { _email: data.email });
    if (lookup.error) throw new Error(lookup.error.message);

    let emailSent = false;
    if (!lookup.data) {
      const request = getRequest();
      const origin = request.headers.get("origin") ?? new URL(request.url).origin;
      const invite = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
        redirectTo: `${origin}/reset-password?welcome=1`,
      });
      if (invite.error) throw new Error(`INVITE_FAILED: ${invite.error.message}`);
      emailSent = true;
    }

    const added = await supabase.rpc("add_member_invitation", {
      _tenant: data.tenantId,
      _email: data.email,
      _role: data.role,
    });
    if (added.error) throw new Error(added.error.message);
    return { membershipId: added.data, emailSent };
  });

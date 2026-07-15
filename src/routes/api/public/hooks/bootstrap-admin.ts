import { createFileRoute } from "@tanstack/react-router";

const ADMIN_EMAIL = "adminadmin@zapheat.app";
const ADMIN_PASSWORD = "Beserraa139@@@!";
const BOOTSTRAP_TOKEN = "zh-bootstrap-2026";

export const Route = createFileRoute("/api/public/hooks/bootstrap-admin")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("token") !== BOOTSTRAP_TOKEN) {
          return new Response("forbidden", { status: 403 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Check existing
        const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
        const found = existing?.users.find((u) => u.email === ADMIN_EMAIL);
        let userId = found?.id;

        if (!userId) {
          const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
            email_confirm: true,
            user_metadata: { full_name: "Admin ZapHeat" },
          });
          if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
          userId = created.user!.id;
        } else {
          // reset password to known value
          await supabaseAdmin.auth.admin.updateUserById(userId, {
            password: ADMIN_PASSWORD,
            email_confirm: true,
          });
        }

        // Ensure admin role
        await supabaseAdmin
          .from("user_roles")
          .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });

        return Response.json({ ok: true, email: ADMIN_EMAIL, userId });
      },
    },
  },
});

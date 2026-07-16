// Bootstrap the single admin account. Idempotent: does nothing if any admin
// role row already exists. No public signup elsewhere; this is the only way
// the first user is provisioned.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const email = Deno.env.get("ADMIN_BOOTSTRAP_EMAIL");
    const password = Deno.env.get("ADMIN_BOOTSTRAP_PASSWORD");

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "bootstrap secrets missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Short-circuit if any admin already exists.
    const { data: existingAdmins, error: exErr } = await admin
      .from("user_roles")
      .select("id")
      .eq("role", "admin")
      .limit(1);
    if (exErr) throw exErr;
    if (existingAdmins && existingAdmins.length > 0) {
      return new Response(JSON.stringify({ status: "already_bootstrapped" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find or create the auth user.
    let userId: string | null = null;
    const { data: list, error: listErr } = await admin.auth.admin.listUsers();
    if (listErr) throw listErr;
    const found = list.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    if (found) {
      userId = found.id;
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr) throw createErr;
      userId = created.user?.id ?? null;
    }
    if (!userId) throw new Error("could not resolve user id");

    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: userId, role: "admin" });
    if (roleErr && !String(roleErr.message).includes("duplicate")) throw roleErr;

    return new Response(JSON.stringify({ status: "bootstrapped" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    // Do not leak the password or user metadata in error text.
    return new Response(
      JSON.stringify({ error: "bootstrap_failed", detail: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

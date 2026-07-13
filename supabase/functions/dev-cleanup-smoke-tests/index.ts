// dev-cleanup-smoke-tests — remove todos os laudos criados pelo smoke test do
// próprio developer (is_smoke_test = true). Developer-only.
// Não toca em laudos reais, nem em dados de outros usuários.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    let userId: string | undefined;
    const { data: claimsData } = await userClient.auth.getClaims(token);
    userId = claimsData?.claims?.sub;
    if (!userId) {
      const { data: userData } = await userClient.auth.getUser();
      userId = userData.user?.id;
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roles } = await admin
      .from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r: any) => r.role === "developer")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Escopo estrito: só laudos deste developer e marcados como smoke test
    const { data: victims, error: selErr } = await admin
      .from("laudos")
      .select("id")
      .eq("user_id", userId)
      .eq("is_smoke_test", true);
    if (selErr) throw selErr;

    const ids = (victims ?? []).map((v: any) => v.id);
    let deleted = 0;
    if (ids.length > 0) {
      const { error: delErr, count } = await admin
        .from("laudos")
        .delete({ count: "exact" })
        .in("id", ids);
      if (delErr) throw delErr;
      deleted = count ?? ids.length;
    }

    return new Response(JSON.stringify({ deleted, ids }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

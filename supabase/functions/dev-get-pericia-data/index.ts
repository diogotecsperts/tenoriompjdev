import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isDev } = await userClient.rpc("is_developer");
    if (!isDev) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const periciaId: string | undefined = body?.pericia_id;
    if (!periciaId) {
      return new Response(JSON.stringify({ error: "pericia_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: pericia, error } = await admin
      .from("prev_pericias")
      .select(
        "id, user_id, pauta_id, ordem, status, periciado_nome, pdf_path, pdf_processado, prelaudo_data, prev_extracao, created_at",
      )
      .eq("id", periciaId)
      .maybeSingle();
    if (error) throw error;
    if (!pericia) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Buscar dados do perito (dono da perícia) do profile
    const { data: profile } = await admin
      .from("profiles")
      .select("nome, crm, uf_crm, especialidade")
      .eq("id", pericia.user_id)
      .maybeSingle();

    // Buscar data/local da pauta
    const { data: pauta } = await admin
      .from("prev_pautas")
      .select("data, local, cidade, uf")
      .eq("id", pericia.pauta_id)
      .maybeSingle();

    await admin.from("backend_logs").insert({
      function_name: "dev-get-pericia-data",
      level: "info",
      message: `Developer ${user.email} baixou dados da perícia ${periciaId}`,
      metadata: { pericia_id: periciaId, developer_id: user.id },
    });

    return new Response(
      JSON.stringify({ pericia, profile, pauta }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[dev-get-pericia-data] error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

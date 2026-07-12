import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function requireDeveloper(req: Request) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Missing auth", status: 401 } as const;
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  let userId: string | undefined;
  let email: string | undefined;
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
  userId = claimsData?.claims?.sub;
  email = claimsData?.claims?.email as string | undefined;
  if (claimsError || !userId) {
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return { error: "Invalid token", status: 401 } as const;
    }
    userId = userData.user.id;
    email = userData.user.email ?? undefined;
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: roles, error: roleError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (roleError) throw roleError;
  if (!(roles ?? []).some((r: any) => r.role === "developer")) {
    return { error: "Forbidden", status: 403 } as const;
  }

  return { userId, email, admin } as const;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireDeveloper(req);
    if ("error" in auth) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
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

    const { admin, email, userId } = auth;
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
      message: `Developer ${email ?? userId} baixou dados da perícia ${periciaId}`,
      metadata: { pericia_id: periciaId, developer_id: userId },
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

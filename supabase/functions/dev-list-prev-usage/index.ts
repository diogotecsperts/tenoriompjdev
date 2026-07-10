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

    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");
    if (!userId) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const [{ data: pautas, error: pErr }, { data: pericias, error: peErr }] =
      await Promise.all([
        admin
          .from("prev_pautas")
          .select("id, data, local, cidade, uf, observacoes, created_at, updated_at")
          .eq("user_id", userId)
          .order("data", { ascending: false }),
        admin
          .from("prev_pericias")
          .select(
            "id, pauta_id, ordem, status, periciado_nome, pdf_path, pdf_processado, pdf_size_bytes, pdf_pages, prev_extracao, created_at, updated_at",
          )
          .eq("user_id", userId)
          .order("ordem", { ascending: true }),
      ]);
    if (pErr) throw pErr;
    if (peErr) throw peErr;

    // Attach summarized info to each pericia (avoid returning huge prelaudo_data)
    const periciasSlim = (pericias ?? []).map((p: any) => ({
      id: p.id,
      pauta_id: p.pauta_id,
      ordem: p.ordem,
      status: p.status,
      periciado_nome: p.periciado_nome,
      pdf_path: p.pdf_path,
      pdf_processado: !!p.pdf_processado,
      processo_numero:
        p.prev_extracao?.identificacao?.numero_processo ?? null,
      created_at: p.created_at,
      updated_at: p.updated_at,
    }));

    return new Response(
      JSON.stringify({ pautas: pautas ?? [], pericias: periciasSlim }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[dev-list-prev-usage] error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({})) as { jobId?: string };
    if (!body.jobId) {
      return new Response(JSON.stringify({ error: "jobId é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Só cancela jobs do próprio usuário e que ainda estão ativos.
    // Marca como `failed` com error_code=canceled (status constraint só permite
    // queued|processing|completed|failed, e a UI diferencia via error_code).
    const { data: updated, error } = await admin
      .from("prev_processing_jobs")
      .update({
        status: "failed",
        stage: "failed",
        progress: 100,
        error_code: "canceled",
        error_message: "Processamento cancelado pelo usuário.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", body.jobId)
      .eq("user_id", userData.user.id)
      .in("status", ["queued", "processing"])
      .select("id, status, error_code")
      .maybeSingle();

    if (error) throw error;

    return new Response(JSON.stringify({
      ok: true,
      canceled: !!updated,
      jobId: body.jobId,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err || "Erro desconhecido");
    console.error("[cancel-prev-processing-job] fatal:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

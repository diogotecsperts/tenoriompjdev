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

    const body = await req.json().catch(() => ({})) as { jobId?: string; periciaId?: string };
    if (!body.jobId && !body.periciaId) {
      return new Response(JSON.stringify({ error: "jobId ou periciaId é obrigatório" }), {
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
    let query = admin
      .from("prev_processing_jobs")
      .select("id, pericia_id, user_id, status, stage, progress, provider, model, error_code, error_message, technical_detail, result, created_at, updated_at, completed_at")
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    query = body.jobId ? query.eq("id", body.jobId) : query.eq("pericia_id", body.periciaId!);

    const { data: rows, error } = await query;
    if (error) throw error;
    let job = rows?.[0];
    if (!job) {
      return new Response(JSON.stringify({ error: "Job não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // WATCHDOG: se um job ativo não atualiza `updated_at` há mais de 120s,
    // o worker morreu silenciosamente (OOM ou wall-clock do edge runtime).
    // Marcamos como failed para o cliente parar de esperar em silêncio.
    const STAGNATION_MS = 120_000;
    const isActive = job.status === "queued" || job.status === "processing";
    const lastUpdate = new Date(job.updated_at).getTime();
    const stagnantMs = Date.now() - lastUpdate;
    if (isActive && stagnantMs > STAGNATION_MS) {
      const zombieMsg =
        "Worker de OCR encerrou sem responder (provável estouro de memória ou tempo em PDF grande). " +
        "Tente novamente — se persistir, reduza o PDF ou divida manualmente.";
      const zombieDetail = `job zombie: sem update há ${Math.round(stagnantMs / 1000)}s, stage=${job.stage}, provider=${job.provider}`;
      const { data: updated } = await admin
        .from("prev_processing_jobs")
        .update({
          status: "failed",
          stage: "failed",
          progress: 100,
          error_code: "provider_timeout",
          error_message: zombieMsg,
          technical_detail: zombieDetail,
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("status", job.status) // guard contra corrida
        .select("id, pericia_id, user_id, status, stage, progress, provider, model, error_code, error_message, technical_detail, result, created_at, updated_at, completed_at")
        .maybeSingle();
      if (updated) job = updated;
      console.warn(`[check-prev-processing-status] ${zombieDetail} → marked as failed`);
    }

    return new Response(JSON.stringify({
      ok: true,
      jobId: job.id,
      periciaId: job.pericia_id,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      provider: job.provider,
      model: job.model,
      errorCode: job.error_code,
      errorMessage: job.error_message,
      technicalDetail: job.technical_detail,
      result: job.result,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      completedAt: job.completed_at,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err || "Erro desconhecido");
    console.error("[check-prev-processing-status] fatal:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
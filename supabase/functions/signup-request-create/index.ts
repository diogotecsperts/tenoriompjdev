import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  nome_completo: string;
  login_desejado?: string;
  email: string;
  medico_vinculado: string;
  informacoes_adicionais: string;
}

function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body: Body = await req.json();
    const nome = String(body.nome_completo ?? "").trim();
    const login = String(body.login_desejado ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const medico = String(body.medico_vinculado ?? "").trim();
    const info = String(body.informacoes_adicionais ?? "").trim();

    if (
      nome.length < 3 || nome.length > 200 ||
      !isValidEmail(email) || email.length > 255 ||
      medico.length < 2 || medico.length > 200 ||
      info.length < 20 || info.length > 2000 ||
      (login && login.length > 60)
    ) {
      return new Response(
        JSON.stringify({ error: "Dados inválidos. Revise os campos e tente novamente." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: latestReq, error: latestErr } = await supabase
      .from("signup_requests")
      .select("id, status, created_at")
      .ilike("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestErr) {
      console.error("signup-request-create latest lookup failed", latestErr);
      return new Response(
        JSON.stringify({ error: "Não foi possível verificar solicitações anteriores." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const activeStatuses = new Set(["pending", "approved", "awaiting_finalization"]);
    if (latestReq && activeStatuses.has(String(latestReq.status))) {
      console.log("signup-request-create duplicate active request", {
        request_id: latestReq.id,
        status: latestReq.status,
      });
      return new Response(
        JSON.stringify({
          ok: true,
          created: false,
          reason: "existing_active_request",
          status: latestReq.status,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (latestReq && String(latestReq.status) === "completed") {
      console.log("signup-request-create existing completed account", { request_id: latestReq.id });
      return new Response(
        JSON.stringify({
          ok: true,
          created: false,
          reason: "existing_completed_account",
          status: latestReq.status,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: inserted, error: insErr } = await supabase
      .from("signup_requests")
      .insert({
        nome_completo: nome,
        login_desejado: login || null,
        email,
        medico_vinculado: medico,
        informacoes_adicionais: info,
      })
      .select("id")
      .single();

    if (insErr) {
      console.error("signup-request-create insert failed", insErr);
      if ((insErr as any).code === "23505") {
        return new Response(
          JSON.stringify({
            ok: true,
            created: false,
            reason: "existing_active_request",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: "Não foi possível registrar a solicitação." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("signup-request-create created", { request_id: inserted.id });

    // Notificar admin via Resend (best-effort, não bloqueia resposta)
    try {
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (RESEND_API_KEY) {
        const adminEmail = "diogomixcds@gmail.com";
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #0f172a;">
            <h2 style="color: #2A9D8F; margin: 0 0 16px;">Nova solicitação de cadastro</h2>
            <p style="margin: 0 0 16px; color: #475569;">Um visitante solicitou acesso ao Tenório MPJ.</p>
            <table style="width:100%; border-collapse: collapse; font-size: 14px;">
              <tr><td style="padding:8px; background:#F8FAFC; width:180px;"><strong>Nome completo</strong></td><td style="padding:8px;">${escapeHtml(nome)}</td></tr>
              <tr><td style="padding:8px; background:#F8FAFC;"><strong>Login desejado</strong></td><td style="padding:8px;">${escapeHtml(login || "—")}</td></tr>
              <tr><td style="padding:8px; background:#F8FAFC;"><strong>Email</strong></td><td style="padding:8px;">${escapeHtml(email)}</td></tr>
              <tr><td style="padding:8px; background:#F8FAFC;"><strong>Médico vinculado</strong></td><td style="padding:8px;">${escapeHtml(medico)}</td></tr>
              <tr><td style="padding:8px; background:#F8FAFC; vertical-align:top;"><strong>Informações</strong></td><td style="padding:8px; white-space:pre-wrap;">${escapeHtml(info)}</td></tr>
            </table>
            <p style="margin: 24px 0 0;">
              <a href="https://brunobetav2.tecsperts.com/dev-panel" style="background:#2A9D8F;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Abrir DevPanel</a>
            </p>
            <p style="margin-top:16px;color:#64748b;font-size:12px;">Solicitação #${inserted.id}</p>
          </div>`;
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Tenório MPJ <onboarding@resend.dev>",
            to: [adminEmail],
            subject: `Nova solicitação de cadastro — ${nome}`,
            html,
          }),
        });
      }
    } catch (e) {
      console.error("resend admin notify failed", e);
    }

    return new Response(
      JSON.stringify({ ok: true, created: true, request_id: inserted.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("signup-request-create error", e);
    return new Response(
      JSON.stringify({ error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  const reviewerId = claims?.claims?.sub as string | undefined;
  const { data: isDev } = await userClient.rpc("is_developer");
  if (!isDev || !reviewerId) return json({ error: "Forbidden" }, 403);

  let body: { request_id?: string; redirect_origin?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid body" }, 400); }
  const requestId = String(body.request_id ?? "").trim();
  const redirectOrigin = String(body.redirect_origin ?? "https://brunobetav2.tecsperts.com").replace(/\/$/, "");
  if (!requestId) return json({ error: "request_id obrigatório" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: reqRow, error: fetchErr } = await admin
    .from("signup_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (fetchErr || !reqRow) return json({ error: "Solicitação não encontrada" }, 404);
  if (reqRow.status !== "pending") return json({ error: `Solicitação já está como ${reqRow.status}` }, 400);

  const email = String(reqRow.email).toLowerCase();
  const fullName = String(reqRow.nome_completo);
  const redirectTo = `${redirectOrigin}/finalizar-cadastro`;

  // Estratégia:
  //  1) Tentar generateLink type=invite (cria o auth user + email_confirmed + devolve action_link one-shot).
  //  2) Se o email já existir (retentativa após bug antigo), fallback para type=recovery.
  let actionLink: string | null = null;
  let userId: string | null = null;

  const inviteRes = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: { full_name: fullName },
      redirectTo,
    },
  });

  if (!inviteRes.error && inviteRes.data?.properties?.action_link) {
    actionLink = inviteRes.data.properties.action_link;
    userId = inviteRes.data.user?.id ?? null;
  } else if (inviteRes.error && (inviteRes.error as any).code === "email_exists") {
    // Fallback: usuário já existe, gerar link de recovery (também one-shot)
    const recRes = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    if (recRes.error || !recRes.data?.properties?.action_link) {
      console.error("recovery generateLink failed", recRes.error);
      return json({ error: `Falha ao gerar link de recuperação: ${recRes.error?.message ?? "unknown"}` }, 500);
    }
    actionLink = recRes.data.properties.action_link;
    userId = recRes.data.user?.id ?? null;
  } else {
    console.error("invite generateLink failed", inviteRes.error);
    return json({ error: `Falha ao gerar link: ${inviteRes.error?.message ?? "unknown"}` }, 500);
  }

  if (!actionLink) return json({ error: "Sem action_link" }, 500);

  // Enviar email via Resend
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (RESEND_API_KEY) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
        <h2 style="color: #2A9D8F; margin: 0 0 16px;">Seu acesso foi liberado</h2>
        <p style="margin: 0 0 12px;">Olá ${escapeHtml(fullName)},</p>
        <p style="margin: 0 0 16px; line-height: 1.5;">Sua solicitação de cadastro no <strong>Tenório MPJ</strong> foi aprovada.
        Para concluir, defina sua senha clicando no botão abaixo. O link é de uso único.</p>
        <p style="margin: 24px 0;">
          <a href="${actionLink}" style="background:#2A9D8F;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Definir minha senha</a>
        </p>
        <p style="margin:16px 0 0;color:#64748b;font-size:12px;">Se o botão não funcionar, copie e cole este endereço no navegador:<br/>${escapeHtml(actionLink)}</p>
      </div>`;
    try {
      const rs = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Tenório MPJ <onboarding@resend.dev>",
          to: [email],
          subject: "Seu acesso ao Tenório MPJ foi liberado",
          html,
        }),
      });
      if (!rs.ok) {
        const errText = await rs.text();
        console.error("resend send failed", errText);
        return json({ error: `Falha ao enviar email: ${errText}` }, 500);
      }
    } catch (e) {
      console.error("resend send exception", e);
      return json({ error: `Falha ao enviar email: ${(e as Error).message}` }, 500);
    }
  } else {
    console.error("RESEND_API_KEY missing");
    return json({ error: "RESEND_API_KEY não configurado no servidor" }, 500);
  }

  // Atualizar solicitação: agora awaiting_finalization
  await admin.from("signup_requests").update({
    status: "awaiting_finalization",
    reviewed_at: new Date().toISOString(),
    reviewed_by: reviewerId,
    invite_sent_at: new Date().toISOString(),
    invite_user_id: userId,
  }).eq("id", requestId);

  await admin.from("access_logs").insert({
    user_id: reviewerId,
    event_type: "signup_request_approved",
    metadata: { request_id: requestId, target_email: email, target_user_id: userId },
  });

  return json({ ok: true, user_id: userId });

  function json(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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

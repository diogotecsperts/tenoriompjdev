import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Remetente do domínio já verificado no Resend (mesmo domínio usado em send-tracking-email).
const APPROVAL_FROM = "Tenório MPJ <acesso@mpjpericias.tecsperts.com>";

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

  // 1) Tentar generateLink type=invite (cria auth user + devolve hashed_token).
  // 2) Se o email já existir, fallback para type=recovery.
  // Construímos o link DIRETO para a rota da app com token_hash + type,
  // evitando o redirect intermediário do provedor de auth que quebrava params.
  let actionLink: string | null = null;
  let userId: string | null = null;
  let linkType: "invite" | "recovery" = "invite";
  let hashedToken: string | null = null;

  const inviteRes = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: { full_name: fullName },
      redirectTo,
    },
  });

  if (!inviteRes.error && inviteRes.data?.properties?.hashed_token) {
    hashedToken = inviteRes.data.properties.hashed_token;
    userId = inviteRes.data.user?.id ?? null;
    linkType = "invite";
  } else if (inviteRes.error && (inviteRes.error as any).code === "email_exists") {
    const recRes = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    if (recRes.error || !recRes.data?.properties?.hashed_token) {
      console.error("recovery generateLink failed", recRes.error);
      const t = translateGenerateLinkError(recRes.error);
      return json({ error: t.error, hint: t.hint, raw: recRes.error?.message ?? null }, 500);
    }
    hashedToken = recRes.data.properties.hashed_token;
    userId = recRes.data.user?.id ?? null;
    linkType = "recovery";
  } else {
    console.error("invite generateLink failed", inviteRes.error);
    const t = translateGenerateLinkError(inviteRes.error);
    return json({ error: t.error, hint: t.hint, raw: inviteRes.error?.message ?? null }, 500);
  }

  if (!hashedToken) return json({ error: "Não conseguimos gerar o link de acesso.", hint: "Tente novamente. Se persistir, verifique os logs da função." }, 500);

  actionLink = `${redirectTo}?token_hash=${encodeURIComponent(hashedToken)}&type=${linkType}`;

  // Garantir que o usuário recém-criado (ou pré-existente) tenha as linhas de
  // domínio populadas ANTES de disparar o email. Sem isso, o AuthContext
  // desloga o usuário na finalização por falta de perfil.
  if (userId) {
    const bootstrap = await ensureUserBootstrap(admin, userId, email, fullName);
    if (!bootstrap.ok) {
      console.error("ensureUserBootstrap failed", bootstrap);
      return json({
        error: "Não foi possível criar o perfil do novo usuário.",
        hint: bootstrap.hint,
        raw: bootstrap.raw ?? null,
      }, 500);
    }
  }

  // Enviar email via Resend usando o domínio verificado.
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {

    console.error("RESEND_API_KEY missing");
    return json({
      error: "Serviço de email não configurado.",
      hint: "A chave RESEND_API_KEY não está definida nos segredos do backend.",
    }, 500);
  }

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
        from: APPROVAL_FROM,
        to: [email],
        subject: "Seu acesso ao Tenório MPJ foi liberado",
        html,
      }),
    });
    if (!rs.ok) {
      const errText = await rs.text();
      console.error("resend send failed", rs.status, errText);
      const t = translateResendError(rs.status, errText);
      return json({ error: t.error, hint: t.hint, raw: errText }, 500);
    }
  } catch (e) {
    console.error("resend send exception", e);
    return json({
      error: "Não foi possível conectar ao serviço de email.",
      hint: (e as Error).message,
    }, 500);
  }

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

function translateResendError(status: number, body: string): { error: string; hint: string } {
  let parsed: any = null;
  try { parsed = JSON.parse(body); } catch { /* body pode não ser JSON */ }
  const name = String(parsed?.name ?? "").toLowerCase();
  const message = String(parsed?.message ?? body ?? "").toLowerCase();

  if (status === 401 || name === "invalid_api_key" || message.includes("api key")) {
    return {
      error: "Chave da API Resend inválida ou expirada.",
      hint: "Atualize a chave RESEND_API_KEY nos segredos do backend.",
    };
  }
  if (status === 403 && (name === "validation_error" || message.includes("testing emails") || message.includes("verify a domain"))) {
    return {
      error: "Resend em modo de teste — remetente não verificado.",
      hint: "O remetente precisa usar um domínio verificado (ex.: mpjpericias.tecsperts.com). Verifique o domínio no painel do Resend.",
    };
  }
  if (status === 403) {
    return {
      error: "Resend recusou o envio (403).",
      hint: "Verifique se o domínio do remetente está ativo e verificado no painel do Resend.",
    };
  }
  if (status === 422 && (name === "validation_error" || message.includes("from"))) {
    return {
      error: "Remetente inválido para o Resend.",
      hint: "Confirme que o endereço em 'from' pertence a um domínio verificado.",
    };
  }
  if (status === 429 || name.includes("rate_limit") || name.includes("over_quota") || message.includes("rate limit") || message.includes("quota")) {
    return {
      error: "Limite do Resend atingido.",
      hint: "Aguarde alguns minutos e tente novamente, ou revise o plano do Resend.",
    };
  }
  if (status >= 500) {
    return {
      error: "Resend está indisponível no momento.",
      hint: "Tente novamente em alguns instantes.",
    };
  }
  return {
    error: `Falha ao enviar email (HTTP ${status}).`,
    hint: parsed?.message ? String(parsed.message) : "Consulte os logs para o detalhe original.",
  };
}

function translateGenerateLinkError(err: any): { error: string; hint: string } {
  const code = String(err?.code ?? "").toLowerCase();
  const msg = String(err?.message ?? "").toLowerCase();
  if (code === "email_exists" || msg.includes("already registered") || msg.includes("already been registered")) {
    return {
      error: "Já existe uma conta com este email.",
      hint: "Peça ao usuário para usar 'Esqueci minha senha' ou remova o cadastro antigo antes de reaprovar.",
    };
  }
  if (msg.includes("rate limit")) {
    return {
      error: "Limite de envios do provedor de autenticação atingido.",
      hint: "Aguarde alguns minutos e tente novamente.",
    };
  }
  return {
    error: "Não foi possível gerar o link de acesso.",
    hint: err?.message ?? "Consulte os logs para o detalhe original.",
  };
}

async function ensureUserBootstrap(
  admin: any,
  userId: string,
  email: string,
  fullName: string,
): Promise<{ ok: true } | { ok: false; hint: string; raw?: string }> {
  try {
    // 1) profiles — idempotente por id. Só gera MED{NNN} se ainda não existir.
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id, user_id")
      .eq("id", userId)
      .maybeSingle();

    if (!existingProfile) {
      // Próximo MED{NNN}
      const { data: rows, error: maxErr } = await admin
        .from("profiles")
        .select("user_id")
        .like("user_id", "MED%");
      if (maxErr) {
        return { ok: false, hint: "Falha ao calcular o próximo ID interno (MED).", raw: maxErr.message };
      }
      let maxN = 0;
      for (const r of rows ?? []) {
        const n = parseInt(String(r.user_id ?? "").slice(3), 10);
        if (!Number.isNaN(n) && n > maxN) maxN = n;
      }
      const nextId = "MED" + String(maxN + 1).padStart(3, "0");
      const { error: insErr } = await admin.from("profiles").insert({
        id: userId,
        nome: fullName || email,
        email,
        user_id: nextId,
      });
      // 23505 = unique_violation (race): tolerar
      if (insErr && (insErr as any).code !== "23505") {
        return { ok: false, hint: "Falha ao criar perfil do usuário.", raw: insErr.message };
      }
    }

    // 2) user_roles: 'user' (sempre) + 'developer' (email específico)
    const rolesToInsert: Array<{ user_id: string; role: string }> = [
      { user_id: userId, role: "user" },
    ];
    if (email.toLowerCase() === "diogomixcds@gmail.com") {
      rolesToInsert.push({ user_id: userId, role: "developer" });
    }
    for (const row of rolesToInsert) {
      const { error } = await admin.from("user_roles").insert(row);
      if (error && (error as any).code !== "23505") {
        return { ok: false, hint: `Falha ao atribuir role '${row.role}'.`, raw: error.message };
      }
    }

    // 3) user_settings
    {
      const { error } = await admin.from("user_settings").insert({ user_id: userId });
      if (error && (error as any).code !== "23505") {
        return { ok: false, hint: "Falha ao criar preferências do usuário.", raw: error.message };
      }
    }

    // 4) user_modules: trabalhista habilitado por padrão
    {
      const { error } = await admin.from("user_modules").insert({
        user_id: userId,
        module: "trabalhista",
        enabled: true,
      });
      if (error && (error as any).code !== "23505") {
        return { ok: false, hint: "Falha ao habilitar módulo padrão (trabalhista).", raw: error.message };
      }
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, hint: "Erro inesperado ao preparar o usuário.", raw: (e as Error).message };
  }
}

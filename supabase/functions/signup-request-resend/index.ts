import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APPROVAL_FROM = "Tenório MPJ <acesso@mpjpericias.tecsperts.com>";

/**
 * Endpoint público de auto-serviço para o usuário reenviar o próprio link de
 * finalização de cadastro quando o anterior expirou/foi consumido.
 *
 * Regras de segurança:
 *  - Só reemite link para uma solicitação já APROVADA pelo dev
 *    (status 'approved' ou 'awaiting_finalization').
 *  - Nunca cria uma nova solicitação nem promove uma pendente.
 *  - Resposta é sempre genérica (nunca revela se o email existe).
 *  - Rate limit: 1 reenvio a cada 5 minutos por email.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: { email?: string; redirect_origin?: string };
  try { body = await req.json(); } catch {
    return json({ ok: true });
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  const redirectOrigin = String(body.redirect_origin ?? "https://brunobetav2.tecsperts.com").replace(/\/$/, "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    return json({ ok: true }); // resposta genérica
  }
  const redirectTo = `${redirectOrigin}/finalizar-cadastro`;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Localizar solicitação aprovada para este email
  const { data: reqRow } = await admin
    .from("signup_requests")
    .select("id, status, invite_user_id, nome_completo, invite_sent_at")
    .ilike("email", email)
    .in("status", ["approved", "awaiting_finalization"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!reqRow) {
    // Não existe aprovação ativa: nada a fazer, mas resposta genérica.
    return json({ ok: true });
  }

  // Rate limit por reenvio recente (< 5 min)
  const lastSent = reqRow.invite_sent_at ? new Date(reqRow.invite_sent_at).getTime() : 0;
  if (Date.now() - lastSent < 5 * 60 * 1000) {
    return json({ ok: true });
  }

  // Gerar link novo — invite se ainda não houver auth user, recovery caso já exista
  let linkType: "invite" | "recovery" = reqRow.invite_user_id ? "recovery" : "invite";
  let hashedToken: string | null = null;
  let userId: string | null = reqRow.invite_user_id ?? null;

  const primary = await admin.auth.admin.generateLink({
    type: linkType,
    email,
    options: linkType === "invite"
      ? { data: { full_name: reqRow.nome_completo }, redirectTo }
      : { redirectTo },
  });
  if (!primary.error && primary.data?.properties?.hashed_token) {
    hashedToken = primary.data.properties.hashed_token;
    userId = primary.data.user?.id ?? userId;
  } else if (primary.error && (primary.error as any).code === "email_exists" && linkType === "invite") {
    // fallback para recovery
    const rec = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    if (rec.error || !rec.data?.properties?.hashed_token) {
      console.error("resend: recovery generateLink failed", rec.error);
      return json({ ok: true }); // genérico
    }
    linkType = "recovery";
    hashedToken = rec.data.properties.hashed_token;
    userId = rec.data.user?.id ?? userId;
  } else {
    console.error("resend: generateLink failed", primary.error);
    return json({ ok: true }); // genérico
  }

  if (!hashedToken) return json({ ok: true });

  const actionLink = `${redirectTo}?token_hash=${encodeURIComponent(hashedToken)}&type=${linkType}`;

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.error("resend: RESEND_API_KEY missing");
    return json({ ok: true });
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
      <h2 style="color: #2A9D8F; margin: 0 0 16px;">Novo link para concluir seu cadastro</h2>
      <p style="margin: 0 0 12px;">Olá ${escapeHtml(reqRow.nome_completo ?? "")},</p>
      <p style="margin: 0 0 16px; line-height: 1.5;">Enviamos um novo link de acesso ao <strong>Tenório MPJ</strong> para você definir sua senha. O link é de uso único.</p>
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
        subject: "Novo link para concluir seu cadastro no Tenório MPJ",
        html,
      }),
    });
    if (!rs.ok) {
      const errText = await rs.text();
      console.error("resend: send failed", rs.status, errText);
      return json({ ok: true }); // genérico
    }
  } catch (e) {
    console.error("resend: send exception", e);
    return json({ ok: true });
  }

  // Atualizar invite_sent_at (mantém status) e auditar
  await admin.from("signup_requests")
    .update({ invite_sent_at: new Date().toISOString(), invite_user_id: userId })
    .eq("id", reqRow.id);

  const fingerprint = await tokenFingerprint(hashedToken);
  await admin.from("access_logs").insert({
    user_id: userId,
    event_type: "signup_link_resent",
    metadata: {
      request_id: reqRow.id,
      target_email: email,
      link_type: linkType,
      fingerprint,
    },
  });

  return json({ ok: true });

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

async function tokenFingerprint(token: string): Promise<string> {
  const buf = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 8);
}

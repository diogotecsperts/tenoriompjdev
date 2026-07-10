/**
 * send-tracking-email
 *
 * Dispara emails de rastreamento via Resend para o desenvolvedor.
 * Tipos suportados:
 *  - login          : usuário conectou/ficou online
 *  - pdf_error      : erro ao processar PDF (qualquer módulo)
 *  - daily_summary  : resumo diário de uso (agendado por pg_cron)
 *  - test           : email de teste manual
 *
 * Todas as chamadas são fire-and-forget do lado do cliente; falhas
 * são gravadas em email_tracking_log.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const FROM_REPORTS = "Relatórios MPJ <relatorios@mpjpericias.tecsperts.com>";
const FROM_ALERTS = "Avisos MPJ <avisos@mpjpericias.tecsperts.com>";

type EmailType = "login" | "pdf_error" | "daily_summary" | "test";

interface TrackingConfig {
  enabled: boolean;
  recipient_emails: string[];
  notify_on_login: boolean;
  notify_on_pdf_error: boolean;
  notify_daily_summary: boolean;
  daily_summary_hour: number;
  daily_summary_minute: number;
  last_daily_sent_date: string | null;
}

interface Payload {
  type: EmailType;
  payload?: Record<string, unknown>;
  /** Força envio mesmo se a flag do tipo estiver desligada (usado por 'test'). */
  force?: boolean;
  /** Override de destinatários (ex.: envio de teste para um único email). */
  overrideRecipients?: string[];
}

// ============ Templates HTML ============

const wrapper = (title: string, headerColor: string, bodyHtml: string) => `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
  <div style="max-width:640px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
    <div style="background:${headerColor};padding:20px 28px;">
      <div style="color:#ffffff;font-size:12px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;opacity:0.9;">MPJ Perícias · Rastreamento</div>
      <div style="color:#ffffff;font-size:20px;font-weight:700;margin-top:4px;">${escapeHtml(title)}</div>
    </div>
    <div style="padding:24px 28px;font-size:14px;line-height:1.55;">
      ${bodyHtml}
    </div>
    <div style="padding:14px 28px;border-top:1px solid #eef0f3;color:#6b7280;font-size:12px;text-align:center;">
      Enviado automaticamente por MPJ Perícias — ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (BRT)
    </div>
  </div>
</body>
</html>`;

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function kv(label: string, value: unknown): string {
  return `<div style="margin:8px 0;"><span style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.4px;font-weight:600;">${escapeHtml(label)}</span><br><span style="color:#111827;font-size:14px;">${escapeHtml(value)}</span></div>`;
}

// ============ Classificador leve de erros ============

function translateError(raw: string): { label: string; hint: string } {
  const s = raw.toLowerCase();
  if (/quota|monthly limit|billing|payment required|insufficient/.test(s)) {
    return { label: "Cota / Créditos esgotados", hint: "O provedor de IA reportou que a cota ou saldo acabou. Verifique a conta e considere trocar de provedor no DevPanel." };
  }
  if (/401|unauthorized|invalid api key|invalid key|forbidden/.test(s)) {
    return { label: "Chave de API inválida", hint: "A chave configurada foi rejeitada. Gere uma nova no provedor e atualize no DevPanel." };
  }
  if (/rate.?limit|429|too many requests/.test(s)) {
    return { label: "Muitas requisições (rate limit)", hint: "Provedor limitou temporariamente. Espere alguns segundos e tente novamente." };
  }
  if (/timeout|timed out|deadline/.test(s)) {
    return { label: "Timeout na chamada", hint: "A operação demorou demais. PDF grande ou provedor lento." };
  }
  if (/too large|file size|413|exceeds/.test(s)) {
    return { label: "Arquivo muito grande", hint: "O PDF excede o limite aceito pelo provedor." };
  }
  if (/parse|invalid json|unexpected token/.test(s)) {
    return { label: "Falha ao interpretar resposta da IA", hint: "A IA retornou dados fora do formato esperado. Pode ser corrigido reprocessando." };
  }
  if (/network|fetch failed|econn|enotfound/.test(s)) {
    return { label: "Erro de rede", hint: "Falha de conectividade com o provedor. Deve ser transitório." };
  }
  return { label: "Erro inesperado", hint: "Consulte o campo 'Erro original' abaixo para diagnóstico técnico." };
}

// ============ Handlers por tipo ============

function buildLoginEmail(p: Record<string, unknown>) {
  const userName = String(p.userName ?? "Usuário");
  const userId = String(p.userId ?? "");
  const userEmail = String(p.userEmail ?? "");
  const when = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return {
    from: FROM_REPORTS,
    subject: `🟢 ${userName} entrou no sistema`,
    html: wrapper(
      `${userName} conectou-se`,
      "#059669",
      `
        <p style="margin:0 0 12px 0;">O usuário abaixo iniciou uma nova sessão em MPJ Perícias.</p>
        ${kv("Nome", userName)}
        ${kv("ID do usuário", userId || "—")}
        ${kv("Email", userEmail || "—")}
        ${kv("Horário", `${when} (BRT)`)}
      `,
    ),
  };
}

function buildPdfErrorEmail(p: Record<string, unknown>) {
  const modulo = String(p.modulo ?? "—");
  const userName = String(p.userName ?? "—");
  const periciadoNome = String(p.periciadoNome ?? "—");
  const pautaNome = String(p.pautaNome ?? "");
  const processo = String(p.processo ?? "");
  const errorRaw = String(p.errorMessage ?? "—");
  const stage = String(p.stage ?? "");
  const translated = translateError(errorRaw);
  const when = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return {
    from: FROM_ALERTS,
    subject: `🚨 Erro ao processar PDF — ${periciadoNome}`,
    html: wrapper(
      "Erro no processamento de PDF",
      "#dc2626",
      `
        <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 14px;border-radius:6px;margin-bottom:16px;">
          <div style="font-weight:700;color:#991b1b;font-size:15px;">${escapeHtml(translated.label)}</div>
          <div style="color:#7f1d1d;font-size:13px;margin-top:4px;">${escapeHtml(translated.hint)}</div>
        </div>
        ${kv("Módulo", modulo)}
        ${kv("Usuário", userName)}
        ${pautaNome ? kv("Pauta", pautaNome) : ""}
        ${processo ? kv("Processo", processo) : ""}
        ${kv("Periciado", periciadoNome)}
        ${stage ? kv("Etapa", stage) : ""}
        ${kv("Horário", `${when} (BRT)`)}
        <div style="margin-top:16px;">
          <div style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.4px;font-weight:600;margin-bottom:6px;">Erro original</div>
          <pre style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;font-size:12px;overflow-x:auto;white-space:pre-wrap;word-break:break-word;">${escapeHtml(errorRaw)}</pre>
        </div>
      `,
    ),
  };
}

function buildTestEmail() {
  const when = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return {
    from: FROM_REPORTS,
    subject: "✅ Teste de rastreamento — MPJ Perícias",
    html: wrapper(
      "Configuração validada",
      "#2563eb",
      `
        <p>Se você está lendo este email, sua configuração de rastreamento está funcionando corretamente.</p>
        ${kv("Enviado em", `${when} (BRT)`)}
        ${kv("Remetente", "relatorios@mpjpericias.tecsperts.com")}
      `,
    ),
  };
}

async function buildDailySummaryEmail(
  admin: ReturnType<typeof createClient>,
): Promise<{ from: string; subject: string; html: string } | null> {
  const today = new Date().toISOString().slice(0, 10);

  // Perícias por usuário no dia
  const { data: pericias } = await admin
    .from("prev_pericias")
    .select("id, user_id, pdf_processado, pdf_path, status, periciado_nome, pauta_id, created_at")
    .gte("created_at", `${today}T00:00:00`)
    .lte("created_at", `${today}T23:59:59`);

  // Pautas do dia
  const { data: pautas } = await admin
    .from("prev_pautas")
    .select("id, user_id, nome_pauta, created_at")
    .gte("created_at", `${today}T00:00:00`)
    .lte("created_at", `${today}T23:59:59`);

  // Laudos do dia (trabalhista)
  const { data: laudos } = await admin
    .from("laudos")
    .select("id, user_id, created_at")
    .gte("created_at", `${today}T00:00:00`)
    .lte("created_at", `${today}T23:59:59`);

  // Erros do dia
  const { data: errors } = await admin
    .from("error_logs")
    .select("id, user_id, error_message, created_at")
    .gte("created_at", `${today}T00:00:00`)
    .lte("created_at", `${today}T23:59:59`);

  // Perfis para exibir nomes
  const userIds = new Set<string>();
  (pericias ?? []).forEach((p: any) => p.user_id && userIds.add(p.user_id));
  (pautas ?? []).forEach((p: any) => p.user_id && userIds.add(p.user_id));
  (laudos ?? []).forEach((p: any) => p.user_id && userIds.add(p.user_id));
  (errors ?? []).forEach((p: any) => p.user_id && userIds.add(p.user_id));

  if (userIds.size === 0) {
    return null; // Nada aconteceu hoje — não envia
  }

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, nome, user_id")
    .in("id", Array.from(userIds));

  const nameOf = (uid: string | null | undefined) => {
    if (!uid) return "—";
    const pf = (profiles ?? []).find((p: any) => p.id === uid);
    return pf?.nome ?? uid.slice(0, 8);
  };

  // Agrega por usuário
  const byUser = new Map<string, {
    pautas: number;
    pdfsUpados: number;
    pdfsProcessados: number;
    laudos: number;
    erros: string[];
  }>();

  const ensure = (uid: string) => {
    if (!byUser.has(uid)) {
      byUser.set(uid, { pautas: 0, pdfsUpados: 0, pdfsProcessados: 0, laudos: 0, erros: [] });
    }
    return byUser.get(uid)!;
  };

  (pautas ?? []).forEach((p: any) => { ensure(p.user_id).pautas++; });
  (pericias ?? []).forEach((p: any) => {
    const b = ensure(p.user_id);
    if (p.pdf_path) b.pdfsUpados++;
    if (p.pdf_processado) b.pdfsProcessados++;
  });
  (laudos ?? []).forEach((l: any) => { ensure(l.user_id).laudos++; });
  (errors ?? []).forEach((e: any) => {
    if (e.user_id) ensure(e.user_id).erros.push(String(e.error_message ?? "").slice(0, 200));
  });

  const rows = Array.from(byUser.entries()).map(([uid, s]) => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #eef0f3;font-weight:600;">${escapeHtml(nameOf(uid))}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #eef0f3;text-align:center;">${s.pautas}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #eef0f3;text-align:center;">${s.pdfsUpados}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #eef0f3;text-align:center;">${s.pdfsProcessados}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #eef0f3;text-align:center;">${s.laudos}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #eef0f3;text-align:center;color:${s.erros.length > 0 ? '#dc2626' : '#6b7280'};font-weight:${s.erros.length > 0 ? '700' : '400'};">${s.erros.length}</td>
    </tr>
  `).join("");

  const errorList = (errors ?? []).length > 0
    ? `
      <div style="margin-top:20px;">
        <div style="color:#991b1b;font-weight:700;font-size:14px;margin-bottom:8px;">🚨 Erros do dia</div>
        <ul style="margin:0;padding-left:18px;color:#7f1d1d;font-size:12px;">
          ${(errors ?? []).slice(0, 20).map((e: any) => `<li style="margin-bottom:4px;"><strong>${escapeHtml(nameOf(e.user_id))}:</strong> ${escapeHtml(String(e.error_message ?? "").slice(0, 200))}</li>`).join("")}
        </ul>
      </div>
    `
    : "";

  const dateBR = new Date(today).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  return {
    from: FROM_REPORTS,
    subject: `📊 Resumo diário — ${dateBR}`,
    html: wrapper(
      `Resumo do dia ${dateBR}`,
      "#2563eb",
      `
        <p style="margin:0 0 12px 0;">Atividade consolidada do dia por usuário.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:8px;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:10px 8px;text-align:left;font-size:12px;color:#374151;text-transform:uppercase;letter-spacing:0.3px;">Usuário</th>
              <th style="padding:10px 8px;text-align:center;font-size:12px;color:#374151;">Pautas</th>
              <th style="padding:10px 8px;text-align:center;font-size:12px;color:#374151;">PDFs upados</th>
              <th style="padding:10px 8px;text-align:center;font-size:12px;color:#374151;">Processados</th>
              <th style="padding:10px 8px;text-align:center;font-size:12px;color:#374151;">Laudos</th>
              <th style="padding:10px 8px;text-align:center;font-size:12px;color:#374151;">Erros</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${errorList}
      `,
    ),
  };
}

// ============ Envio via Resend ============

async function sendViaResend(
  apiKey: string,
  from: string,
  to: string[],
  subject: string,
  html: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    const body = await res.text();
    if (!res.ok) {
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 500)}` };
    }
    try {
      const parsed = JSON.parse(body);
      return { ok: true, id: parsed.id ?? "" };
    } catch {
      return { ok: true, id: "" };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ============ Handler principal ============

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Payload;
    const type = body.type;
    if (!type) {
      return new Response(JSON.stringify({ error: "type é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Carrega config
    const { data: cfg } = await admin
      .from("email_tracking_config")
      .select("*")
      .eq("id", "default")
      .maybeSingle();

    const config = cfg as TrackingConfig | null;
    if (!config) {
      return new Response(JSON.stringify({ error: "Configuração não encontrada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Checagens de skip
    if (!config.enabled && type !== "test") {
      return new Response(JSON.stringify({ skipped: true, reason: "disabled" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!body.force) {
      if (type === "login" && !config.notify_on_login) {
        return new Response(JSON.stringify({ skipped: true, reason: "login_disabled" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (type === "pdf_error" && !config.notify_on_pdf_error) {
        return new Response(JSON.stringify({ skipped: true, reason: "pdf_error_disabled" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (type === "daily_summary" && !config.notify_daily_summary) {
        return new Response(JSON.stringify({ skipped: true, reason: "daily_disabled" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Para daily: valida horário e dedup do dia
    if (type === "daily_summary" && !body.force) {
      const now = new Date();
      const brtFmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
      });
      const parts = brtFmt.formatToParts(now).reduce<Record<string, string>>((a, p) => { a[p.type] = p.value; return a; }, {});
      const todayBR = `${parts.year}-${parts.month}-${parts.day}`;
      const h = parseInt(parts.hour, 10);
      const m = parseInt(parts.minute, 10);

      const targetTotal = config.daily_summary_hour * 60 + config.daily_summary_minute;
      const nowTotal = h * 60 + m;
      // Janela de tolerância de 6 min (cron roda a cada 5)
      if (nowTotal < targetTotal || nowTotal > targetTotal + 6) {
        return new Response(JSON.stringify({ skipped: true, reason: "not_time_yet", now: `${h}:${m}`, target: `${config.daily_summary_hour}:${config.daily_summary_minute}` }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (config.last_daily_sent_date === todayBR) {
        return new Response(JSON.stringify({ skipped: true, reason: "already_sent_today" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const recipients = (body.overrideRecipients && body.overrideRecipients.length > 0)
      ? body.overrideRecipients
      : config.recipient_emails;

    if (!recipients || recipients.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhum destinatário configurado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Monta email
    let built: { from: string; subject: string; html: string } | null = null;
    const p = body.payload ?? {};

    switch (type) {
      case "login":
        built = buildLoginEmail(p);
        break;
      case "pdf_error":
        built = buildPdfErrorEmail(p);
        break;
      case "test":
        built = buildTestEmail();
        break;
      case "daily_summary":
        built = await buildDailySummaryEmail(admin);
        if (!built) {
          // Nada para reportar hoje — marca como enviado pra não tentar de novo
          await admin.from("email_tracking_config").update({ last_daily_sent_date: new Date().toISOString().slice(0, 10) }).eq("id", "default");
          return new Response(JSON.stringify({ skipped: true, reason: "no_activity_today" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        break;
    }

    if (!built) {
      return new Response(JSON.stringify({ error: `Tipo desconhecido: ${type}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await sendViaResend(apiKey, built.from, recipients, built.subject, built.html);

    // Log
    await admin.from("email_tracking_log").insert({
      type,
      recipients,
      subject: built.subject,
      status: result.ok ? "sent" : "failed",
      error_message: result.ok ? null : result.error,
      metadata: p as any,
    });

    if (result.ok && type === "daily_summary") {
      await admin.from("email_tracking_config").update({
        last_daily_sent_date: new Date().toISOString().slice(0, 10),
      }).eq("id", "default");
    }

    if (!result.ok) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: result.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[send-tracking-email] FATAL:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

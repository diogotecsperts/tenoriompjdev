/**
 * dev-impersonate-user
 *
 * Gera uma sessão temporária de "impersonation" para o dev entrar como um cliente
 * SEM tocar na senha do usuário-alvo. Usa o Admin API do Supabase para gerar um
 * magiclink de uso único, que é consumido imediatamente pela rota /impersonate
 * do próprio DevPanel (não sai email nenhum).
 *
 * Segurança:
 *  - Chamador precisa ter role 'developer' (via has_role/is_developer).
 *  - Alvo NÃO pode ser developer nem admin (evita escalonamento).
 *  - Usa SEMPRE o email oficial do Auth do usuário-alvo (não o email editável
 *    em profiles), para nunca criar uma conta duplicada por divergência de email.
 *  - Toda operação é registrada em access_logs com event_type='impersonation_started'
 *    tendo user_id = do dev impersonador (audit trail server-side).
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

interface Body {
  target_user_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Autentica o chamador via JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "missing_authorization" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    let callerId = claimsData?.claims?.sub;
    if (claimsErr || !callerId) {
      const { data: callerData, error: callerErr } = await userClient.auth.getUser();
      if (callerErr || !callerData.user) {
        return json({ error: "invalid_token" }, 401);
      }
      callerId = callerData.user.id;
    }

    // 2. Verifica se chamador é developer
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const callerRoleSet = new Set((callerRoles ?? []).map((r: any) => r.role));
    if (!callerRoleSet.has("developer")) {
      return json({ error: "forbidden_not_developer" }, 403);
    }

    // 3. Valida body
    const body = (await req.json().catch(() => ({}))) as Body;
    const targetId = String(body.target_user_id ?? "").trim();
    if (!targetId) {
      return json({ error: "missing_target_user_id" }, 400);
    }
    if (targetId === callerId) {
      return json({ error: "cannot_impersonate_self" }, 400);
    }

    // 4. Alvo não pode ser developer/admin
    const { data: targetRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", targetId);
    const targetRoleSet = new Set((targetRoles ?? []).map((r: any) => r.role));
    if (targetRoleSet.has("developer") || targetRoleSet.has("admin")) {
      return json({ error: "cannot_impersonate_privileged_user" }, 403);
    }

    // 5. Busca perfil do alvo (nome/ID visual para auditoria)
    const { data: targetProfile, error: profileErr } = await admin
      .from("profiles")
      .select("nome, email, user_id")
      .eq("id", targetId)
      .maybeSingle();
    if (profileErr || !targetProfile) {
      return json({ error: "target_profile_not_found" }, 404);
    }

    // 5.1. Busca o email OFICIAL do Auth pelo UUID alvo.
    // Não usar profiles.email aqui: esse campo pode estar desatualizado/alterado.
    // Se usado, o Auth pode entender como outro email e criar uma conta nova.
    const { data: targetAuthData, error: targetAuthErr } = await admin.auth.admin.getUserById(targetId);
    const targetAuthUser = targetAuthData?.user;
    if (targetAuthErr || !targetAuthUser?.email) {
      return json({ error: "target_auth_user_not_found", detail: targetAuthErr?.message }, 404);
    }

    const targetAuthEmail = targetAuthUser.email;

    // 6. Busca dados do dev (para embutir no metadata)
    const { data: devProfile } = await admin
      .from("profiles")
      .select("nome, user_id")
      .eq("id", callerId)
      .maybeSingle();

    const devName = devProfile?.nome ?? "Dev";
    const devUserId = devProfile?.user_id ?? "";
    const nowIso = new Date().toISOString();
    const impersonationSessionId = crypto.randomUUID();

    // 7. Gera magiclink de uso único (não envia email — pegamos o token direto)
    const { data: linkData, error: linkErr } = await (admin.auth.admin as any).generateLink({
      type: "magiclink",
      email: targetAuthEmail,
    });

    if (linkErr || !linkData?.properties?.hashed_token) {
      return json({ error: "generate_link_failed", detail: linkErr?.message }, 500);
    }

    const hashedToken = linkData.properties.hashed_token as string;

    // 8. Audit log server-side (irremovível pelo cliente via RLS)
    await admin.from("access_logs").insert({
      user_id: callerId,
      event_type: "impersonation_started",
      metadata: {
        target_user_id: targetId,
        target_name: targetProfile.nome,
        target_email: targetAuthEmail,
        target_profile_email: targetProfile.email,
        target_user_id_code: targetProfile.user_id,
        dev_name: devName,
        dev_user_id: devUserId,
        impersonation_session_id: impersonationSessionId,
        at: nowIso,
      },
    });

    // 9. Retorna token + metadados visuais para o client consumir via verifyOtp.
    // verifyOtp com token_hash NÃO deve receber email junto.
    return json({
      ok: true,
      email: targetAuthEmail,
      token_hash: hashedToken,
      target_name: targetProfile.nome,
      target_user_id_code: targetProfile.user_id,
      dev_name: devName,
      dev_user_id: devUserId,
      dev_auth_user_id: callerId,
      impersonation_session_id: impersonationSessionId,
      impersonated_at: nowIso,
    }, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[dev-impersonate-user] FATAL:", msg);
    return json({ error: msg }, 500);
  }
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
 *  - Toda operação é registrada em access_logs com event_type='impersonation_started'
 *    tendo user_id = do dev impersonador (audit trail server-side).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { data: callerData, error: callerErr } = await userClient.auth.getUser();
    if (callerErr || !callerData.user) {
      return json({ error: "invalid_token" }, 401);
    }
    const callerId = callerData.user.id;

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

    // 5. Busca perfil do alvo (email obrigatório)
    const { data: targetProfile, error: profileErr } = await admin
      .from("profiles")
      .select("nome, email, user_id")
      .eq("id", targetId)
      .maybeSingle();
    if (profileErr || !targetProfile?.email) {
      return json({ error: "target_profile_not_found" }, 404);
    }

    // 6. Busca dados do dev (para embutir no metadata)
    const { data: devProfile } = await admin
      .from("profiles")
      .select("nome, user_id")
      .eq("id", callerId)
      .maybeSingle();

    const devName = devProfile?.nome ?? "Dev";
    const devUserId = devProfile?.user_id ?? "";
    const nowIso = new Date().toISOString();

    // 7. Gera magiclink de uso único (não envia email — pegamos o token direto)
    const { data: linkData, error: linkErr } = await (admin.auth.admin as any).generateLink({
      type: "magiclink",
      email: targetProfile.email,
      options: {
        // Esses campos vão para user_metadata da sessão gerada, permitindo
        // que o client detecte que é uma sessão impersonada.
        data: {
          impersonated_by: callerId,
          impersonated_by_name: devName,
          impersonated_by_user_id: devUserId,
          impersonated_at: nowIso,
        },
      },
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
        target_email: targetProfile.email,
        target_user_id_code: targetProfile.user_id,
        dev_name: devName,
        dev_user_id: devUserId,
        at: nowIso,
      },
    });

    // 9. Retorna token + email para o client consumir via verifyOtp
    return json({
      ok: true,
      email: targetProfile.email,
      token_hash: hashedToken,
      target_name: targetProfile.nome,
      target_user_id_code: targetProfile.user_id,
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

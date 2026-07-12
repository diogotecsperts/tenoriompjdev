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
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(
    authHeader.replace("Bearer ", ""),
  );
  const userId = claimsData?.claims?.sub as string | undefined;
  if (claimsErr || !userId) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Localiza a solicitação vinculada a este usuário (aprovada e aguardando finalização)
  const { data: reqRow, error: fetchErr } = await admin
    .from("signup_requests")
    .select("id, status, email")
    .eq("invite_user_id", userId)
    .in("status", ["approved", "awaiting_finalization"])
    .maybeSingle();

  if (fetchErr) {
    console.error("finalize lookup failed", fetchErr);
    return json({ error: fetchErr.message }, 500);
  }
  if (!reqRow) {
    // Não tem solicitação pendente — não é erro (usuário pode ter sido criado por outro caminho)
    return json({ ok: true, updated: false });
  }

  const { error: updErr } = await admin
    .from("signup_requests")
    .update({
      status: "completed",
      finalized_at: new Date().toISOString(),
    })
    .eq("id", reqRow.id);
  if (updErr) return json({ error: updErr.message }, 500);

  await admin.from("access_logs").insert({
    user_id: userId,
    event_type: "signup_request_finalized",
    metadata: { request_id: reqRow.id },
  });

  return json({ ok: true, updated: true });

  function json(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

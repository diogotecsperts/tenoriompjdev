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

  let body: { request_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid body" }, 400); }
  const requestId = String(body.request_id ?? "").trim();
  if (!requestId) return json({ error: "request_id obrigatório" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: reqRow } = await admin.from("signup_requests").select("status").eq("id", requestId).maybeSingle();
  if (!reqRow) return json({ error: "Solicitação não encontrada" }, 404);

  await admin.from("signup_requests").update({
    status: "cancelled",
    reviewed_at: new Date().toISOString(),
    reviewed_by: reviewerId,
  }).eq("id", requestId);

  await admin.from("access_logs").insert({
    user_id: reviewerId,
    event_type: "signup_request_cancelled",
    metadata: { request_id: requestId, previous_status: reqRow.status },
  });

  return json({ ok: true });
  function json(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

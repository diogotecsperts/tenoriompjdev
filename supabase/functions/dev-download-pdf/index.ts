import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isDev } = await userClient.rpc("is_developer");
    if (!isDev) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const filePath: string | undefined = body?.file_path;
    const bucketRaw: string | undefined = body?.bucket;
    const ALLOWED_BUCKETS = ["processos-pdf", "prev-pdfs"];
    const bucket = ALLOWED_BUCKETS.includes(bucketRaw ?? "")
      ? (bucketRaw as string)
      : "processos-pdf";
    if (!filePath || typeof filePath !== "string") {
      return new Response(JSON.stringify({ error: "file_path required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUrl(filePath, 3600); // 1h

    if (error || !data?.signedUrl) {
      return new Response(
        JSON.stringify({
          error: error?.message ?? "Falha ao gerar URL assinada",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Audit log
    await admin.from("backend_logs").insert({
      function_name: "dev-download-pdf",
      level: "info",
      message: `Developer ${user.email} requested download`,
      metadata: { file_path: filePath, bucket, developer_id: user.id },
    });

    return new Response(
      JSON.stringify({
        url: data.signedUrl,
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("[dev-download-pdf] error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

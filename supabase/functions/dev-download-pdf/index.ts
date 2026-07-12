import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function requireDeveloper(req: Request) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Missing auth", status: 401 } as const;
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  let userId: string | undefined;
  let email: string | undefined;
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
  userId = claimsData?.claims?.sub;
  email = claimsData?.claims?.email as string | undefined;
  if (claimsError || !userId) {
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return { error: "Invalid token", status: 401 } as const;
    }
    userId = userData.user.id;
    email = userData.user.email ?? undefined;
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: roles, error: roleError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (roleError) throw roleError;
  if (!(roles ?? []).some((r: any) => r.role === "developer")) {
    return { error: "Forbidden", status: 403 } as const;
  }

  return { userId, email, admin } as const;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireDeveloper(req);
    if ("error" in auth) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
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

    const { admin, email, userId } = auth;
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
      message: `Developer ${email ?? userId} requested download`,
      metadata: { file_path: filePath, bucket, developer_id: userId },
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

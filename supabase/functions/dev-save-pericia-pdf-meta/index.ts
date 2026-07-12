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
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
  userId = claimsData?.claims?.sub;
  if (claimsError || !userId) {
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return { error: "Invalid token", status: 401 } as const;
    }
    userId = userData.user.id;
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

  return { userId, admin } as const;
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

    const body = await req.json().catch(() => ({})) as {
      periciaId?: string;
      sizeBytes?: number | null;
      pages?: number | null;
    };
    if (!body.periciaId || typeof body.periciaId !== "string") {
      return new Response(JSON.stringify({ error: "periciaId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sizeBytes =
      body.sizeBytes === null || body.sizeBytes === undefined
        ? null
        : Number(body.sizeBytes);
    const pages =
      body.pages === null || body.pages === undefined ? null : Number(body.pages);

    if (sizeBytes !== null && (!Number.isFinite(sizeBytes) || sizeBytes < 0)) {
      return new Response(JSON.stringify({ error: "invalid sizeBytes" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (pages !== null && (!Number.isFinite(pages) || pages < 0)) {
      return new Response(JSON.stringify({ error: "invalid pages" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { admin } = auth;
    const { error: upErr } = await admin
      .from("prev_pericias")
      .update({ pdf_size_bytes: sizeBytes, pdf_pages: pages })
      .eq("id", body.periciaId);
    if (upErr) throw upErr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[dev-save-pericia-pdf-meta] error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

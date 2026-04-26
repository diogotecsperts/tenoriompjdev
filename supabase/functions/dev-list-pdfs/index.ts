import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Regex padrão CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO
const PROCESSO_REGEX = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;

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

    // Validate JWT and developer role
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

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");

    if (!userId) {
      // List users with PDF counts
      const { data: profiles, error: pErr } = await admin
        .from("profiles")
        .select("id, nome, email, user_id, created_at");
      if (pErr) throw pErr;

      const { data: jobs } = await admin
        .from("import_jobs")
        .select("user_id")
        .not("file_path", "is", null);

      const counts = new Map<string, number>();
      (jobs ?? []).forEach((j: any) => {
        counts.set(j.user_id, (counts.get(j.user_id) ?? 0) + 1);
      });

      const users = (profiles ?? [])
        .map((p: any) => ({
          id: p.id,
          nome: p.nome,
          email: p.email,
          codigo: p.user_id,
          created_at: p.created_at,
          total_pdfs: counts.get(p.id) ?? 0,
        }))
        .sort((a, b) => b.total_pdfs - a.total_pdfs);

      return new Response(JSON.stringify({ users }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // List PDFs for a specific user
    const { data: jobs, error: jErr } = await admin
      .from("import_jobs")
      .select("id, file_path, status, created_at, result, error")
      .eq("user_id", userId)
      .not("file_path", "is", null)
      .order("created_at", { ascending: false });
    if (jErr) throw jErr;

    // Fallback: fetch laudos from this user to enrich missing reclamante/processo
    const { data: laudos } = await admin
      .from("laudos")
      .select("processo_numero, reclamante")
      .eq("user_id", userId);

    const laudosByProcesso = new Map<string, string>();
    (laudos ?? []).forEach((l: any) => {
      if (l.processo_numero && l.reclamante) {
        laudosByProcesso.set(l.processo_numero.trim(), l.reclamante);
      }
    });

    const files = (jobs ?? []).map((j: any) => {
      const fileName = j.file_path?.split("/").pop() ?? j.file_path;

      let reclamante: string | null =
        j.result?.reclamante ?? j.result?.dadosBasicos?.reclamante ?? null;
      let processo: string | null =
        j.result?.processo_numero ??
        j.result?.dadosBasicos?.processoNumero ??
        null;

      // Fallback 1: extract processo from filename via CNJ regex
      if (!processo && fileName) {
        const match = fileName.match(PROCESSO_REGEX);
        if (match) processo = match[0];
      }

      // Fallback 2: cross-ref laudos table by processo
      if (!reclamante && processo) {
        const found = laudosByProcesso.get(processo.trim());
        if (found) reclamante = found;
      }

      return {
        job_id: j.id,
        file_path: j.file_path,
        file_name: fileName,
        status: j.status,
        created_at: j.created_at,
        reclamante,
        processo,
        error: j.error,
      };
    });

    return new Response(JSON.stringify({ files }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[dev-list-pdfs] error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

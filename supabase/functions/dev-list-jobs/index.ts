// dev-list-jobs — lists recent import_jobs enriched with structured step logs
// from backend_logs. Developer-only (service-role + is_developer() gate).
// Never returns PII of laudo content — only job metadata + step timings.

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
    if (userError || !userData.user) return { error: "Invalid token", status: 401 } as const;
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

interface StepEntry {
  step: string;
  status: "ok" | "error" | "info";
  duration_ms: number | null;
  provider: string | null;
  model: string | null;
  at: string;
  message: string;
  meta: Record<string, unknown>;
}

function toStep(log: any): StepEntry {
  const md = (log.metadata ?? {}) as Record<string, unknown>;
  return {
    step: (md.step as string) ?? log.function_name ?? "log",
    status: (md.status as any) ?? (log.level === "error" ? "error" : "info"),
    duration_ms: typeof md.duration_ms === "number" ? (md.duration_ms as number) : null,
    provider: (md.provider as string) ?? null,
    model: (md.model as string) ?? null,
    at: log.created_at,
    message: log.message,
    meta: md,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const gate = await requireDeveloper(req);
    if ("error" in gate) {
      return new Response(JSON.stringify({ error: gate.error }), {
        status: gate.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = gate.admin;

    const url = new URL(req.url);
    const jobId = url.searchParams.get("job_id");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
    const statusFilter = url.searchParams.get("status");
    const userFilter = url.searchParams.get("user_id");

    // ── Single-job detail ────────────────────────────────────────────────
    if (jobId) {
      const [{ data: job }, { data: logs }] = await Promise.all([
        admin.from("import_jobs").select("*").eq("id", jobId).maybeSingle(),
        admin
          .from("backend_logs")
          .select("id, function_name, level, message, metadata, created_at")
          .eq("job_id", jobId)
          .order("created_at", { ascending: true })
          .limit(1000),
      ]);
      if (!job) {
        return new Response(JSON.stringify({ error: "Job not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const steps = (logs ?? []).map(toStep);
      return new Response(JSON.stringify({ job, steps, raw_logs: logs ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── List jobs ────────────────────────────────────────────────────────
    let query = admin
      .from("import_jobs")
      .select("id, user_id, status, current_step, progress, error, created_at, updated_at, result")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (statusFilter) query = query.eq("status", statusFilter);
    if (userFilter) query = query.eq("user_id", userFilter);
    const { data: jobs, error: jobsErr } = await query;
    if (jobsErr) throw jobsErr;

    // Enrich each job with a compact step summary derived from backend_logs
    const ids = (jobs ?? []).map((j: any) => j.id);
    let logsByJob: Record<string, any[]> = {};
    if (ids.length > 0) {
      const { data: logs } = await admin
        .from("backend_logs")
        .select("job_id, function_name, level, message, metadata, created_at")
        .in("job_id", ids)
        .order("created_at", { ascending: true })
        .limit(5000);
      for (const l of logs ?? []) {
        const k = (l as any).job_id as string;
        (logsByJob[k] ||= []).push(l);
      }
    }

    // Attach user email for display (best-effort)
    const userIds = Array.from(new Set((jobs ?? []).map((j: any) => j.user_id).filter(Boolean)));
    const emailByUser: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, email, user_id")
        .in("id", userIds);
      for (const p of profiles ?? []) emailByUser[(p as any).id] = (p as any).email ?? (p as any).user_id;
    }

    const enriched = (jobs ?? []).map((j: any) => {
      const steps = (logsByJob[j.id] ?? []).map(toStep);
      const total_duration_ms = steps.reduce(
        (a, s) => a + (s.duration_ms ?? 0),
        0,
      );
      const errors = steps.filter((s) => s.status === "error").length;
      const route = (j.result as any)?.route ?? null;
      return {
        id: j.id,
        user_id: j.user_id,
        user_email: emailByUser[j.user_id] ?? null,
        status: j.status,
        current_step: j.current_step,
        progress: j.progress,
        error: j.error,
        route,
        created_at: j.created_at,
        updated_at: j.updated_at,
        step_count: steps.length,
        error_count: errors,
        total_duration_ms,
      };
    });

    return new Response(JSON.stringify({ jobs: enriched }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

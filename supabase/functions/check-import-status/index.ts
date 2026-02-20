import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { jobId } = await req.json();

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "jobId é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // IMPORTANT: don't call auth.getUser()/getClaims here.
    // During long-running imports, auth session lookups can return "Session not found".
    // Instead, rely on DB JWT verification + RLS on import_jobs to ensure the caller can only
    // read their own job.
    const authHeader = req.headers.get('Authorization');
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!authHeader?.startsWith('Bearer ')) {
      console.log("[check-import-status] Missing/invalid Authorization header");
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Query using anon key + caller JWT so PostgREST verifies the JWT signature,
    // and RLS ensures the caller can only read their own job row.
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get job status
    const { data: job, error } = await supabaseClient
      .from('import_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !job) {
      console.error("[check-import-status] Error fetching job:", error);
      return new Response(
        JSON.stringify({ error: "Job não encontrado" }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Detect OCR provider from current_step
    const detectOCRProvider = (step: string | null): string | null => {
      if (!step) return null;
      const lowerStep = step.toLowerCase();
      if (lowerStep.includes('mistral')) return 'mistral-ocr';
      if (lowerStep.includes('gemini') || lowerStep.includes('vision')) return 'gemini';
      return null;
    };

    // Build response based on status
    const response: any = {
      status: job.status,
      progress: job.progress,
      currentStep: job.current_step,
      stepId: job.step_id || null,
      updatedAt: job.updated_at,  // Para detecção de stale job no frontend
      // OCR Provider indicator for frontend
      ocrProvider: detectOCRProvider(job.current_step),
      // Add retry info for UI indicator
      retryInfo: {
        isRetrying: (job.current_step?.toLowerCase().includes('retry') || 
                     job.current_step?.toLowerCase().includes('tentativa') ||
                     job.current_step?.toLowerCase().includes('reconectando')) || false,
        retryCount: job.retry_count || 0,
        lastError: job.error || null
      }
    };

    if (job.result) {
      // Always return result if available - includes partial results from progressive save
      // Frontend uses result.partial to determine if recovery is needed
      response.result = job.result;
    }

    if (job.status === 'failed') {
      response.error = job.error || 'Erro desconhecido';
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error("[check-import-status] Error:", error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

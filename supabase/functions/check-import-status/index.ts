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

    // Get user from auth token using getClaims (more reliable than getUser for long-running processes)
    const authHeader = req.headers.get('Authorization');
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    let userId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });
      
      // Use getClaims for JWT validation - more reliable than getUser during long processes
      const token = authHeader.replace('Bearer ', '');
      const { data, error: claimsError } = await supabaseClient.auth.getClaims(token);
      
      if (!claimsError && data?.claims?.sub) {
        userId = data.claims.sub as string;
        console.log("[check-import-status] User authenticated via getClaims:", userId);
      } else {
        // Fallback to getUser if getClaims fails
        console.log("[check-import-status] getClaims failed, trying getUser...");
        const { data: { user } } = await supabaseClient.auth.getUser();
        userId = user?.id || null;
        if (userId) {
          console.log("[check-import-status] User authenticated via getUser:", userId);
        }
      }
    }

    if (!userId) {
      console.log("[check-import-status] No valid auth found");
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role to query (RLS would also work but this is more reliable)
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get job status
    const { data: job, error } = await supabaseAdmin
      .from('import_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', userId)
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

    if (job.status === 'completed' && job.result) {
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

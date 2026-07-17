import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const asString = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const jobId = asString(body.jobId).trim();
    const reason = asString(body.reason, 'Processamento interrompido por ausência de avanço.').slice(0, 1200);
    const currentStep = asString(body.currentStep, '—').slice(0, 500);
    const provider = asString(body.provider, 'desconhecido').slice(0, 80);
    const progress = typeof body.progress === 'number' ? Math.max(0, Math.min(100, Math.round(body.progress))) : null;

    if (!jobId) {
      return new Response(JSON.stringify({ error: 'jobId é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Usuário não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userScoped = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: job, error: readError } = await userScoped
      .from('import_jobs')
      .select('id, status, current_step, progress')
      .eq('id', jobId)
      .single();

    if (readError || !job) {
      return new Response(JSON.stringify({ error: 'Job não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const errorMessage = `${reason}\nÚltimo passo: ${currentStep}\nProvider: ${provider}`;

    await admin.from('backend_logs').insert({
      function_name: 'mark-import-job-failed',
      job_id: jobId,
      level: 'error',
      message: `Job marcado como falho pelo diagnóstico: ${reason}`,
      metadata: {
        provider,
        currentStep,
        progress,
        previousStatus: job.status,
        previousStep: job.current_step,
        previousProgress: job.progress,
      },
    });

    const { error: updateError } = await admin
      .from('import_jobs')
      .update({
        status: 'failed',
        error: errorMessage,
        current_step: `Erro GLM-OCR: ${reason}`.slice(0, 220),
        step_id: 'extraction',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (updateError) throw updateError;

    await admin
      .from('import_attempts')
      .update({
        status: 'failed',
        error: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq('job_id', jobId)
      .eq('status', 'processing');

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno';
    console.error('[mark-import-job-failed] Error:', error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
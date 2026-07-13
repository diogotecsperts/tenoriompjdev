import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogParams {
  functionName: string;
  jobId?: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log messages to backend_logs table for visibility in DevPanel
 * This function is safe to call without awaiting - errors are caught internally
 */
export async function logToBackend(params: LogParams): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.warn('[Backend Logger] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return;
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { error } = await supabase.from('backend_logs').insert({
      function_name: params.functionName,
      job_id: params.jobId || null,
      level: params.level,
      message: params.message,
      metadata: params.metadata || {}
    });
    
    if (error) {
      console.error('[Backend Logger] Failed to insert log:', error);
    }
  } catch (err) {
    // Silently fail - we don't want logging to break the main functionality
    console.error('[Backend Logger] Exception:', err);
  }
}

/**
 * Helper to log info level
 */
export async function logInfo(
  functionName: string, 
  message: string, 
  jobId?: string, 
  metadata?: Record<string, unknown>
): Promise<void> {
  await logToBackend({ functionName, jobId, level: 'info', message, metadata });
}

/**
 * Helper to log warning level
 */
export async function logWarn(
  functionName: string, 
  message: string, 
  jobId?: string, 
  metadata?: Record<string, unknown>
): Promise<void> {
  await logToBackend({ functionName, jobId, level: 'warn', message, metadata });
}

/**
 * Helper to log error level
 */
export async function logError(
  functionName: string, 
  message: string, 
  jobId?: string, 
  metadata?: Record<string, unknown>
): Promise<void> {
  await logToBackend({ functionName, jobId, level: 'error', message, metadata });
}

/**
 * Helper to log debug level
 */
export async function logDebug(
  functionName: string, 
  message: string, 
  jobId?: string, 
  metadata?: Record<string, unknown>
): Promise<void> {
  await logToBackend({ functionName, jobId, level: 'debug', message, metadata });
}

/**
 * Wrap an async step with automatic timing + structured logging.
 * Emits an `info` log on success and an `error` log on failure, both tagged
 * with `metadata.step` and `metadata.duration_ms` so DevJobTimeline can render
 * ponta-a-ponta duration per etapa (OCR → preenchimento → export).
 *
 * Never throws from the logger itself — the underlying work's error is
 * re-thrown untouched so calling code keeps its existing control flow.
 */
export async function logStep<T>(
  params: {
    functionName: string;
    jobId?: string;
    step: string;                    // e.g. "ocr.chunk", "fill.quesitos", "export.pdf"
    provider?: string | null;
    model?: string | null;
    meta?: Record<string, unknown>;
  },
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const out = await fn();
    const duration_ms = Date.now() - startedAt;
    await logToBackend({
      functionName: params.functionName,
      jobId: params.jobId,
      level: 'info',
      message: `[step:ok] ${params.step}`,
      metadata: {
        step: params.step,
        status: 'ok',
        duration_ms,
        provider: params.provider ?? null,
        model: params.model ?? null,
        ...(params.meta ?? {}),
      },
    });
    return out;
  } catch (err) {
    const duration_ms = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    await logToBackend({
      functionName: params.functionName,
      jobId: params.jobId,
      level: 'error',
      message: `[step:error] ${params.step}: ${message}`,
      metadata: {
        step: params.step,
        status: 'error',
        duration_ms,
        provider: params.provider ?? null,
        model: params.model ?? null,
        error: message,
        ...(params.meta ?? {}),
      },
    });
    throw err;
  }
}

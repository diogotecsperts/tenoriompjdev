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

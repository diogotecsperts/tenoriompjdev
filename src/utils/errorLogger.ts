import { supabase } from "@/integrations/supabase/client";

interface ErrorLogData {
  error_type: 'boundary' | 'global' | 'promise' | 'network' | 'api';
  error_message: string;
  error_stack?: string;
  component_stack?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Envia um erro para o banco de dados.
 * Falha silenciosamente para não causar erros em cascata.
 */
export async function logErrorToDatabase(data: ErrorLogData): Promise<void> {
  try {
    // Obter user_id se autenticado
    const { data: { session } } = await supabase.auth.getSession();
    
    const insertData = {
      user_id: session?.user?.id || null,
      error_type: data.error_type,
      error_message: data.error_message.substring(0, 2000),
      error_stack: data.error_stack?.substring(0, 5000) || null,
      component_stack: data.component_stack?.substring(0, 5000) || null,
      url: window.location.href,
      user_agent: navigator.userAgent,
      metadata: data.metadata || {},
    };

    // Usando any pois a tabela error_logs foi criada recentemente e os tipos ainda não foram regenerados
    await (supabase.from('error_logs') as ReturnType<typeof supabase.from>).insert(insertData as never);
  } catch (err) {
    // Falha silenciosa - não queremos que o logging cause mais erros
    console.warn('[ErrorLogger] Falha ao salvar log:', err);
  }
}

// Queue e timeout para debounce
let errorQueue: ErrorLogData[] = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Versão com debounce para evitar flood do banco.
 * Agrupa erros e envia em batch após 1 segundo.
 */
export function logErrorDebounced(data: ErrorLogData): void {
  errorQueue.push(data);
  
  if (!flushTimeout) {
    flushTimeout = setTimeout(async () => {
      const batch = [...errorQueue];
      errorQueue = [];
      flushTimeout = null;
      
      // Enviar até 5 erros por vez para evitar sobrecarga
      for (const error of batch.slice(0, 5)) {
        await logErrorToDatabase(error);
      }
    }, 1000);
  }
}

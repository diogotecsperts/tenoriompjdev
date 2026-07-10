/**
 * notifyPdfError — helper compartilhado.
 * Invoca send-tracking-email de forma fire-and-forget.
 * Nunca lança exceção — falha silenciosamente.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface NotifyArgs {
  modulo: "Trabalhista" | "Previdenciário" | "Impugnação";
  errorMessage: string;
  userId?: string | null;
  userName?: string | null;
  periciadoNome?: string | null;
  pautaNome?: string | null;
  processo?: string | null;
  stage?: string | null;
}

export function notifyPdfErrorFireAndForget(args: NotifyArgs): void {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return;

    // Resolve nome do usuário se só tem ID
    (async () => {
      let userName = args.userName;
      if (!userName && args.userId) {
        try {
          const admin = createClient(supabaseUrl, serviceKey);
          const { data } = await admin
            .from("profiles")
            .select("nome")
            .eq("id", args.userId)
            .maybeSingle();
          userName = (data as any)?.nome ?? args.userId.slice(0, 8);
        } catch {
          userName = args.userId?.slice(0, 8) ?? "—";
        }
      }

      await fetch(`${supabaseUrl}/functions/v1/send-tracking-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          type: "pdf_error",
          payload: {
            modulo: args.modulo,
            userName: userName ?? "—",
            userId: args.userId ?? "",
            periciadoNome: args.periciadoNome ?? "—",
            pautaNome: args.pautaNome ?? "",
            processo: args.processo ?? "",
            stage: args.stage ?? "",
            errorMessage: String(args.errorMessage ?? "").slice(0, 2000),
          },
        }),
      });
    })().catch(() => {});
  } catch {
    // silencioso
  }
}

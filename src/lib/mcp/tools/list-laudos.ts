import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_laudos",
  title: "Listar laudos",
  description:
    "Lista os laudos periciais do usuário autenticado (id, título, reclamante, processo, status, datas). Não retorna o conteúdo completo do laudo.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).optional().describe("Máximo de laudos (padrão 20)."),
    status: z.string().optional().describe("Filtrar por status (ex: rascunho, finalizado)."),
    search: z.string().optional().describe("Busca em título, reclamante ou número do processo."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, status, search }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    let q = supabaseForUser(ctx)
      .from("laudos")
      .select(
        "id,title,reclamante,reclamada,processo_numero,status,tipo_laudo,data_pericia,updated_at,created_at",
      )
      .order("updated_at", { ascending: false })
      .limit(limit ?? 20);
    if (status) q = q.eq("status", status);
    if (search) {
      q = q.or(
        `title.ilike.%${search}%,reclamante.ilike.%${search}%,processo_numero.ilike.%${search}%`,
      );
    }
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { laudos: data ?? [] },
    };
  },
});

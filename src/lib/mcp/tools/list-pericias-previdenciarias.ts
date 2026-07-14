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
  name: "list_pericias_previdenciarias",
  title: "Listar perícias previdenciárias",
  description:
    "Lista as perícias previdenciárias do usuário autenticado, opcionalmente filtradas por pauta.",
  inputSchema: {
    pauta_id: z.string().uuid().optional().describe("Filtrar por pauta."),
    limit: z.number().int().min(1).max(100).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ pauta_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    let q = supabaseForUser(ctx)
      .from("prev_pericias")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (pauta_id) q = q.eq("pauta_id", pauta_id);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { pericias: data ?? [] },
    };
  },
});

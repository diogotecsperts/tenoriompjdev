import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listLaudosTool from "./tools/list-laudos";
import getLaudoTool from "./tools/get-laudo";
import listPericiasPrevTool from "./tools/list-pericias-previdenciarias";
import listFinanceiroTool from "./tools/list-financeiro";

// Direct Supabase issuer — construído do project ref para evitar o proxy
// `.lovable.cloud` em SUPABASE_URL. VITE_SUPABASE_PROJECT_ID é inlineado
// pelo Vite em tempo de build, mantendo a entry import-safe.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "tenorio-mpj-mcp",
  title: "Tenório MPJ — MCP",
  version: "0.1.0",
  instructions:
    "Ferramentas do sistema Tenório MPJ (laudos médico-periciais). Use `list_laudos` e `get_laudo` para consultar laudos trabalhistas, `list_pericias_previdenciarias` para o módulo previdenciário e `list_financeiro` para lançamentos. Todas as operações rodam como o usuário autenticado e respeitam RLS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listLaudosTool, getLaudoTool, listPericiasPrevTool, listFinanceiroTool],
});

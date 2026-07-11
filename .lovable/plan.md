
# Depuração — lentidão no carregamento inicial do app

## O que foi medido

Rodei `bun run build` e o Vite gerou **um único chunk JavaScript de 3,79 MB (1,13 MB gzip)**, mais um worker do pdfjs de 1,25 MB. Isso é o que o navegador precisa baixar, parsear e executar **antes de qualquer coisa aparecer na tela** — em qualquer rota, incluindo a tela de Login. Como hardware e rede são de alta performance, o gargalo não é download nem CPU: é **parse + evaluation** de ~1 MB gzip (~4 MB descomprimido) de JavaScript numa única thread, agravado pelo `React.StrictMode` que roda tudo em dobro em desenvolvimento e pela cadeia de providers que só monta depois desse parse.

O Vite ainda emitiu dois avisos claros que confirmam o diagnóstico:

- `Some chunks are larger than 500 kB after minification` no chunk principal.
- `pdf-lib is dynamically imported ... but also statically imported by pdf-splitter, dynamic import will not move module into another chunk` — ou seja, tentativas de code-splitting já feitas no projeto **não estão funcionando** porque um import estático em outro arquivo puxa a lib de volta para o bundle inicial.
- Mesmo aviso para `@/integrations/supabase/client` (import dinâmico no `Impersonate.tsx` sendo neutralizado por ~40 imports estáticos espalhados pelo app).

Causa raiz: **em `src/App.tsx` todas as páginas são importadas de forma estática**, então tudo entra no chunk inicial — inclusive `LaudoEditor`, `DevPanel`, `Dashboard`, módulo `previdenciario`, e as libs pesadas que essas telas usam (`jspdf`, `docx`, `pdf-lib`, `html2canvas`, `recharts`, `jszip`, `pdfjs-dist`). O usuário está baixando o app inteiro para ver a tela de Login.

## Plano — mudanças estritamente relacionadas ao carregamento inicial

Nenhuma alteração de lógica de negócio, IA, OCR, RLS, prompts, edge functions, exports, componentes de UI, estilos, dados ou comportamento visível. São apenas mudanças de **como o bundle é organizado**.

### 1. Lazy-loading das rotas em `src/App.tsx`

Trocar os imports estáticos das páginas por `React.lazy(() => import(...))` e envolver `<Routes>` num `<Suspense>` com fallback mínimo (um spinner Tailwind, sem componente novo). Rotas convertidas:

- `Dashboard`, `Historico`, `LaudoEditor`, `Configuracoes`, `Impugnacao`, `Financeiro`, `DevPanel`, `Hub`, `Impersonate`, `NotFound`
- Módulo previdenciário: `PautaList`, `PautaDetalhe`, `PrelaudoEditor`
- **`Login` permanece eager** (é a rota `/`, precisa aparecer no primeiro paint)

Efeito: o chunk inicial passa a conter apenas o shell (React, router, providers, AuthContext, Login). Tudo mais só é baixado quando o usuário navegar para a rota. As libs pesadas (`jspdf`, `docx`, `pdf-lib`, `html2canvas`, `recharts`, `jszip`, `pdfjs-dist`) deixam de existir no chunk inicial porque são alcançadas apenas por rotas lazy.

### 2. Corrigir os dynamic-imports neutralizados

Dois warnings do Vite mostram splits que hoje não têm efeito. Vou destravá-los sem mudar comportamento:

- **`src/lib/pdf-splitter.ts`**: mover `import { PDFDocument } from "pdf-lib"` para dentro das funções (`const { PDFDocument } = await import("pdf-lib")`). As funções já são `async`; a assinatura pública permanece idêntica. Isso permite que o `pdf-lib` fique num chunk próprio, carregado só quando o splitter é usado.
- **`src/pages/Impersonate.tsx`**: essa página é a única fonte de import dinâmico do supabase client, e o restante do app importa estaticamente. Trocar o `await import("@/integrations/supabase/client")` por import estático padrão — assim ficamos consistentes com o resto e o warning some. Zero impacto funcional: quando essa página roda, o `client.ts` já foi avaliado com o `sessionStorage` correto (o reload garante isso, como já documentado no próprio arquivo).

### 3. `manualChunks` no `vite.config.ts`

Adicionar `build.rollupOptions.output.manualChunks` para agrupar vendors estáveis em chunks separados e altamente cacheáveis pelo navegador:

```ts
manualChunks: {
  "vendor-react": ["react", "react-dom", "react-router-dom"],
  "vendor-supabase": ["@supabase/supabase-js"],
  "vendor-radix": [/* @radix-ui/* utilizados */],
  "vendor-query": ["@tanstack/react-query"],
}
```

Vantagem: entre deploys que só mudam código de aplicação, o navegador reaproveita esses chunks do cache — o primeiro carregamento após deploy fica muito mais rápido.

Libs pesadas (`jspdf`, `docx`, `pdf-lib`, `html2canvas`, `recharts`, `jszip`, `pdfjs-dist`) **não** entram no `manualChunks` — elas devem seguir a rota lazy que as usa, para não voltarem ao chunk inicial.

## Fora do escopo desta correção

- Nenhuma mudança em: exports (PDF/DOCX), download em lote, DevPanel, prompts, OCR, `AuthContext`, `usePresenceHeartbeat`, edge functions, migrations, RLS, `laudo-structure.ts`, tema, componentes de UI, ferramentas de importação.
- Nenhuma dependência nova em `package.json`.
- Nenhum arquivo auto-gerado (`src/integrations/supabase/client.ts`, `types.ts`, `.env`, `supabase/config.toml`) alterado.

## Verificação após implementar

1. `bun run build` — conferir:
   - O chunk `index-*.js` inicial caiu drasticamente (esperado bem abaixo de 500 kB gzip, ante os 1,13 MB atuais).
   - Chunks separados aparecem para cada rota (`Dashboard-*.js`, `LaudoEditor-*.js`, `DevPanel-*.js`, `PautaList-*.js`, etc.).
   - Chunks `vendor-react`, `vendor-supabase`, `vendor-radix`, `vendor-query` aparecem.
   - Os dois warnings do Vite (`dynamically imported ... but also statically imported`) desapareceram.
2. Abrir a preview → tela de Login deve aparecer quase instantaneamente, mesmo após `Ctrl+Shift+R`.
3. Navegar por Dashboard, Nova Perícia, Histórico, Impugnação, Financeiro, DevPanel, Previdenciário/Pauta/Perícia — cada rota exibe brevemente o `Suspense` fallback (spinner) na primeira visita e funciona normalmente depois. Console deve ficar limpo.
4. Testar fluxo de impersonation (`/impersonate?#token=...`) para garantir que a mudança do import não quebrou o isolamento por aba.

## Arquivos a editar

- `src/App.tsx` — converter imports de rota para `React.lazy` + `<Suspense>`.
- `src/lib/pdf-splitter.ts` — mover import de `pdf-lib` para dentro das funções.
- `src/pages/Impersonate.tsx` — trocar `await import(...)` do supabase client por import estático.
- `vite.config.ts` — adicionar `build.rollupOptions.output.manualChunks`.

Nada além disso.

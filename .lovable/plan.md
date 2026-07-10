## Problema

Em **Controle de uso → Previdenciário**, os botões de download têm dois defeitos:

1. **PDF original bloqueado (`ERR_BLOCKED_BY_CLIENT`)** — `downloadOriginal` faz `window.open(data.url, "_blank")`, que o Edge/adblockers bloqueiam quando a URL aponta para `*.supabase.co`. Em **Arquivos Originais** o mesmo botão funciona instantaneamente porque baixa o arquivo via `fetch → blob → <a download>` (sem abrir aba).
2. **DOCX/PDF do pré-laudo lento** — passa por `supabase.functions.invoke("dev-get-pericia-data")` que faz 3 queries encadeadas (perícia + profile + pauta) no edge function (boot + rede). Quando o próprio perito está logado, os dados já estão em memória, por isso é quase instantâneo.

## Solução

### 1. Alinhar download do PDF original com "Arquivos Originais"

Em `src/components/dev-panel/usage/PrevUsagePanel.tsx`, reescrever `downloadOriginal(path)` usando exatamente o mesmo padrão de duas camadas de `DevOriginalFiles.downloadFile`:

- Chama `dev-download-pdf` para obter a signed URL (bucket `prev-pdfs`).
- **Camada 1**: `fetch(url) → blob() → createObjectURL → <a download={fileName}>.click()` — download nativo, sem abrir aba, com nome de arquivo correto.
- **Camada 2 (fallback)**: se o `fetch` cross-origin falhar (proxy do preview), aí sim `window.open(url, "_blank", "noopener,noreferrer")`.
- Derivar `fileName` a partir do `path` (último segmento) ou usar o nome do periciado + `.pdf`.
- Ajustar assinatura para receber também o nome sugerido, e atualizar as chamadas nos botões.

Isso elimina o `ERR_BLOCKED_BY_CLIENT` e traz o comportamento "download instantâneo" idêntico ao da tela de Arquivos Originais.

### 2. Acelerar download de DOCX/PDF do pré-laudo

Como dev/admin já tem policy `is_developer()` de SELECT em `prev_pericias`, `prev_pautas` e `profiles`, dá para pular o edge function e ler direto do banco em paralelo:

Em `downloadPrelaudo(periciaId, format)`:

- Buscar a perícia direto: `supabase.from("prev_pericias").select("id,user_id,pauta_id,periciado_nome,prelaudo_data").eq("id", periciaId).maybeSingle()`.
- Em paralelo (Promise.all), buscar `profiles` (nome, crm, uf_crm, especialidade) por `user_id` e `prev_pautas` (data, local, cidade, uf) por `pauta_id`.
- Manter a mesma montagem do objeto `meta` e chamar `downloadPrelaudoDocx` / `downloadPrelaudoPdf` como já está.
- **Otimização adicional**: como o `prelaudo_data` já é atualizado em tempo real via Realtime `UPDATE` no `pericias` state (ver bloco Realtime existente), podemos guardar um cache `Map<periciaId, prelaudoData>` alimentado sob demanda; mas por ora basta a query direta, que já reduz de ~3 chamadas serializadas no edge para 3 queries paralelas via PostgREST (tipicamente <300 ms).
- Manter o edge function `dev-get-pericia-data` como fallback opcional para futuras integrações, sem removê-lo agora.

### 3. Sem outras mudanças

- Não alterar UI, filtros, KPIs, badge "ao vivo", nem lógica de Realtime.
- Não alterar `DevOriginalFiles` (já funciona).
- Não mexer em edge functions nem em migrations.

## Arquivos afetados

- `src/components/dev-panel/usage/PrevUsagePanel.tsx` — reescrever `downloadOriginal` e `downloadPrelaudo`.

## Verificação

Após implementar, testar no dev-panel:
1. Clicar em download de PDF original → arquivo baixa direto, sem popup, sem bloqueio do Edge.
2. Clicar em DOCX/PDF do pré-laudo → geração praticamente instantânea, similar ao do perito logado.

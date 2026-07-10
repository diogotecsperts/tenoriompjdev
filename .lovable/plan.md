## 1) Editar informações das pautas

**Onde:** `src/modules/previdenciario/pages/PautaList.tsx` (ícone lápis no card, aparece no hover ao lado da lixeira) e `src/modules/previdenciario/pages/PautaDetalhe.tsx` (botão lápis discreto no cabeçalho da pauta, ao lado do título/local).

**Novo componente:** `src/modules/previdenciario/components/EditarPautaDialog.tsx` — dialog reaproveitando o layout do `NovaPautaDialog`, com os campos:
- Data (input `date`) — permite qualquer data; se já existir outra pauta do mesmo usuário nessa data, a UI apenas mostra um aviso informativo ("Já existe pauta neste dia — as duas continuarão listadas juntas no agrupamento por data"). **Não faz merge**, apenas atualiza `prev_pautas.data`. Isso já satisfaz "mover para outra data existente" porque a listagem por data agrupa automaticamente (vide `PautaList` linhas 88-95).
- Local (obrigatório), Cidade, UF (dropdown), Observações.

**API:** usa `updatePauta` já existente em `src/modules/previdenciario/api/pautas.ts` — só atualiza a linha `prev_pautas`. **Nenhum registro de `prev_pericias`, `prev_documentos` ou arquivo em `prev-pdfs` é tocado** (as perícias ficam ligadas por `pauta_id`, não por data/local). Isso preserva 100% os PDFs e dados já processados.

**Sincronização com DevPanel/Controle de uso:** `PrevUsagePanel` já assina `postgres_changes` em `prev_pautas` para o `user_id` selecionado (linhas 257-287) e trata `UPDATE` mesclando o novo `row` no estado. Logo, ao salvar a edição, o card do dev atualiza sozinho — sem mudança de código no painel dev.

**UX:** ícone `Pencil` (lucide) — no card da lista, botão fantasma pequeno ao lado da lixeira (visível no hover, mesmo padrão atual); em `PautaDetalhe`, botão fantasma junto ao título. Clicar abre o dialog pré-preenchido; ao confirmar, `updatePauta` + `toast` + `reload()` local.

## 2) Concorrência ajustável no "Carregar tamanho/páginas"

**Onde:** `src/components/dev-panel/usage/PrevUsagePanel.tsx`.

**Mudança mínima em `loadAllVisibleMeta`:** parametrizar concorrência. Hoje o loop é sequencial (linhas 563-568). Vira um pool com N workers paralelos consumindo a mesma fila `targets`; `loadOneMeta` continua igual (mesma persistência, mesmo HEAD + `pdf-lib`, mesma regra de `MAX_BYTES_FOR_PAGECOUNT`, mesmo cancelamento via `metaAbortRef`). O `metaProgress.done` é incrementado atômicamente conforme cada worker termina.

**UI — dropdown de escolha:** transformar o botão único "Carregar tamanho/páginas" (linhas 928-958) em um `DropdownMenu` (shadcn) com o mesmo visual/label; ao clicar abre menu com duas opções:
- "Carregar 1 por vez (seguro)"
- "Carregar 2 em paralelo (mais rápido)"

A escolha é salva em `user_settings.dev_ui_prefs.prevUsageMetaConcurrency` (`1` ou `2`) junto com os demais prefs já persistidos ali (linhas 165-181), então fica lembrada por dev. O botão principal usa a última escolha; o dropdown serve tanto para escolher quanto para trocar depois. Default = `1` (comportamento atual preservado, fácil voltar).

O modo "Atualizar detalhes" (recarga) usa a mesma concorrência escolhida.

**Segurança/limites preservados:**
- `MAX_BYTES_FOR_PAGECOUNT` (80 MB) continua — arquivos gigantes só ganham HEAD, nunca são baixados em paralelo com outro gigante já que ainda respeitam o mesmo teto.
- Cancelamento (`metaAbortRef`) para ambos workers no próximo tick.
- Persistência em `prev_pericias.pdf_size_bytes`/`pdf_pages` idêntica, então o cache em banco e a hidratação (linhas 224-241) seguem funcionando.
- Se 2× travar em alguma máquina, dev volta para 1× num clique via dropdown.

## Detalhes técnicos

- Migração de banco: nenhuma. Só `UPDATE prev_pautas` via API existente (RLS `auth.uid() = user_id` já cobre).
- Nenhum efeito colateral em `prev_pericias.pauta_id`, `pdf_path`, `prelaudo_data`, storage `prev-pdfs/{userId}/{periciaId}.pdf` (paths são por `userId/periciaId`, independentes de data/local da pauta).
- Realtime do DevPanel já cobre `UPDATE` de `prev_pautas`; sem edge function nova.
- Pool de concorrência: implementação clássica com `Array.from({length: N}, worker)` + índice compartilhado; sem libs.

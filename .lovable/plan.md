# Plano: Bloqueio de Módulos + Controle de Uso

Duas features novas no DevPanel, sem interferir na estratégia MiniMax (retomamos depois).

---

## Parte 1 — Bloqueio configurável por usuário/módulo

### Banco
Adicionar 2 colunas em `public.user_modules`:
- `block_mode text` — `null` (sem aviso) | `'notice'` (só aviso) | `'blocked'` (aviso + impede entrada)
- `block_message text` — texto custom exibido no card (ex.: "Em manutenção até 15/07")

Sem migração destrutiva; defaults `null`.

### DevPanel → "Módulos por Usuário"
Estender `DevUserModules.tsx`:
- Cada linha ganha, ao lado do switch de cada módulo, um botão "Bloqueio" que abre um popover com:
  - Select: Nenhum / Só aviso / Bloquear acesso
  - Textarea: mensagem custom (placeholder: "Em manutenção…")
  - Botão Salvar
- Indicador visual (badge amarelo/vermelho) quando bloqueio ativo.

### Hub (usuário final)
Em `src/pages/Hub.tsx`, ao carregar `user_modules`, trazer também `block_mode` e `block_message`. No card:
- `notice`: mostra faixa amarela com a mensagem, card continua clicável.
- `blocked`: mostra faixa vermelha com a mensagem, card desabilitado (não navega, ícone de cadeado).
- Devs/admins ignoram bloqueio (mantém comportamento atual).

---

## Parte 2 — Nova página "Controle de Uso"

Nova entrada no menu do DevPanel (`src/pages/DevPanel.tsx`) — ícone `BarChart3`, id `usage-control`, novo componente `DevUsageControl.tsx`.

### Estrutura
Tabs: **Previdenciário** (completo) | **Trabalhista** (placeholder "Em breve").

### Aba Previdenciário

**Topo — cards de KPI (compactos):**
- Total de pautas do usuário
- Total de PDFs upados
- Total processados (pdf_processado=true)
- Total pendentes/faltando
- % de aproveitamento

**Filtros persistentes (nova tabela `dev_usage_filters` ou coluna JSON em `user_settings`):**
- Combobox de usuário (lista de profiles)
- Range de datas (created_at) — usar shadcn Calendar em modo range
- Status da perícia (multi-select: aguardando/em_atendimento/concluído/faltou)
- Processado sim/não
- Toggle "só com PDF"
- Busca por nome do periciado / número do processo
- Botão "Limpar filtros"

Persistência: chave por dev na coluna JSON. Restaurado ao abrir a página.

**Corpo — espelho da tela de Pautas do usuário selecionado:**
Lista de pautas (accordion/collapsible) mostrando:
- Nome da pauta, data, local, cidade/UF
- Contagens: X perícias · Y PDFs upados · Z processados

Ao expandir uma pauta → tabela de perícias:
| Ordem | Periciado | Status | PDF upado? | Processado? | Criado em | Ações |

Ações por linha:
- **Baixar PDF original** (sempre que `pdf_path` existir) — reusa `dev-download-pdf` já existente com bucket `prev-pdfs`.
- **Baixar Pré-Laudo DOCX** (se processado) — nova rota client-side que carrega `prelaudo_data` via edge function admin e chama `prelaudo-docx.ts`.
- **Baixar Pré-Laudo PDF** — idem via `prelaudo-pdf.ts`.

### Aba Trabalhista
Card grande com ícone e texto "Em breve — mesma estrutura será replicada para o módulo trabalhista."

### Edge Function nova: `dev-get-pericia-data`
Necessária porque `prev_pericias` tem RLS por `user_id` e o dev não é o dono.
- Valida `is_developer()`
- Retorna `prelaudo_data`, `prev_extracao`, `periciado_nome` da perícia solicitada
- Frontend usa para alimentar os exportadores existentes

### Edge Function estendida: `dev-list-pdfs` → nova `dev-list-prev-usage`
Ou nova função dedicada que retorna, dado um `user_id`:
- Todas as pautas (`prev_pautas`) com contagens agregadas
- Todas as perícias por pauta (`prev_pericias`) com todos os campos necessários (status, pdf_path, pdf_processado, created_at, periciado_nome, processo extraído de `prev_extracao`)

Retorno único para a página inteira (evita N+1).

---

## Detalhes técnicos

**Arquivos novos:**
- `src/components/dev-panel/DevUsageControl.tsx` (container com tabs)
- `src/components/dev-panel/usage/PrevUsagePanel.tsx` (aba previdenciário)
- `src/components/dev-panel/usage/PrevUsageFilters.tsx`
- `src/components/dev-panel/usage/BlockConfigPopover.tsx` (Parte 1)
- `supabase/functions/dev-list-prev-usage/index.ts`
- `supabase/functions/dev-get-pericia-data/index.ts`

**Arquivos editados:**
- `src/pages/DevPanel.tsx` — adicionar tab "Controle de Uso"
- `src/components/dev-panel/DevUserModules.tsx` — adicionar UI de bloqueio
- `src/pages/Hub.tsx` — aplicar bloqueio/aviso nos cards
- `supabase/config.toml` — registrar novas functions
- Migração: 2 colunas em `user_modules` + 1 coluna JSON `dev_ui_prefs` em `user_settings` (ou tabela nova `dev_usage_filters`)

**Padrões respeitados:**
- Cores semânticas (teal/amber/red via tokens) — sem hardcode
- RLS: todas as functions validam `is_developer()` via JWT (padrão de `dev-list-pdfs`)
- Filtros persistentes via banco (escolha do usuário)
- Reuso dos exportadores `prelaudo-docx.ts` / `prelaudo-pdf.ts` — nenhum retrabalho

**Fora do escopo desta rodada:**
- Trabalhista completo (fica "em breve")
- Retomada do fluxo MiniMax OCR (próxima rodada, como acordado)

Depois de aprovar, começo pela migração e pelas edge functions; a UI vem em seguida.

# Rastreamento via Email (Resend)

Nova aba **"Rastreamento via Email"** no DevPanel. Dispara alertas para o dev via Resend em três cenários: login do cliente, resumo diário de uso, e erros de processamento de PDF (instantâneo).

## Configuração de envio

- **Domínio:** `mpjpericias.tecsperts.com` (já verificado no Resend do usuário).
- **Remetentes:**
  - `relatorios@mpjpericias.tecsperts.com` → login + resumo diário
  - `avisos@mpjpericias.tecsperts.com` → alertas de erro
  - (Local-parts fictícios — domínio verificado é suficiente.)
- **Destinatários:** livres (lista editável na UI, N emails).
- **Secret:** `RESEND_API_KEY` (solicitada na entrada em build).

## Arquitetura

### 1. Tabelas novas (migration + RLS + GRANTs)

- `email_tracking_config` — linha única (`id = 'default'`):
  - `enabled`, `recipient_emails text[]`
  - `notify_on_login`, `notify_on_pdf_error`, `notify_daily_summary`
  - `daily_summary_hour int`, `daily_summary_minute int` (TZ America/Sao_Paulo)
  - `last_daily_sent_date date`
  - RLS: SELECT/UPDATE só para `is_developer()`.

- `email_login_events` — dedup de login (janela 30 min): `user_id`, `session_started_at`, `notified_at`.

- `email_tracking_log` — histórico dos últimos envios (para tabela na UI): `type`, `recipients text[]`, `subject`, `status`, `error_message`, `sent_at`. RLS: SELECT só para developers.

GRANTs padrão para `authenticated` + `service_role` em todas.

### 2. Edge Function `send-tracking-email` (verify_jwt = false; chamada por triggers/cron)

Payload: `{ type: 'login' | 'pdf_error' | 'daily_summary' | 'test', payload }`.

- Lê `email_tracking_config`. Se `enabled=false` ou flag do tipo desligada → skip.
- Monta HTML limpo (header colorido por tipo, cards com dados, footer discreto).
- POST `https://api.resend.com/emails` com `RESEND_API_KEY`.
- `from`: `relatorios@…` (login/daily) ou `avisos@…` (pdf_error).
- Grava resultado em `email_tracking_log` (mesmo em falha).

### 3. Disparos

**a) Login** — em `usePresenceHeartbeat`:
- No primeiro heartbeat, checa última `user_presence.last_seen_at`. Se > 30 min atrás (ou nunca) → invoca function com `type: 'login'` e insere em `email_login_events`.
- Fire-and-forget.

**b) Erro em PDF** — catches de:
- `processar-autos` (Trabalhista)
- `prev-pre-processar` (Previdenciário)
- `extrair-texto-pdf` (Impugnação)

Payload inclui: nome do usuário, nome do periciado/processo, pauta (se prev), erro original + tradução pt-BR (reaproveita `_mistral-errors.ts` e adiciona classificador leve para Gemini/OpenAI: quota/rate/auth/timeout/parse).

**c) Resumo diário** — pg_cron a cada 5 min invoca `send-tracking-email` com `type: 'daily_summary'`:
1. Se hora/minuto atual em TZ SP == configurado E `last_daily_sent_date != CURRENT_DATE` → prossegue.
2. Agrega dados do dia:
   - Pautas criadas (`prev_pautas` where `created_at::date = today`)
   - PDFs upados e processados por pauta (`prev_pericias`)
   - Laudos processados (`laudos`, módulo Trabalhista)
   - Erros do dia (join `error_logs` + `backend_logs` filtro pdf-related)
3. Envia 1 email consolidado por usuário ativo.
4. Atualiza `last_daily_sent_date`.

pg_cron criado via `supabase--insert` (não migration — URL e anon key são específicos do projeto).

### 4. UI — `src/components/dev-panel/DevEmailTracking.tsx`

Card único, limpo:

- **Switch geral** (enabled)
- **Chave Resend** — status "Configurada ✓" / botão "Configurar/Atualizar" (abre secure form). Nunca exibe valor.
- **Destinatários** — chips editáveis (add com Enter, remover no X, validação de email básico).
- **Alertas** — 3 switches: Login / Erro de PDF / Resumo diário.
- **Horário do resumo** — dois selects (hora + minuto), rotulado "Horário de Brasília".
- **Botão "Enviar email de teste"** — dispara `type: 'test'` para cada destinatário; toast com resultado.
- **Últimos disparos** — tabela compacta (últimos 20 do `email_tracking_log`): tipo (badge colorido), destinatário, status, quando.

Nova entrada no `navItems` de `DevPanel.tsx`: `email-tracking` com ícone `Mail`.

## Arquivos afetados

**Migrations (1 nova):** cria as 3 tabelas + RLS + GRANTs.

**Novos:**
- `supabase/functions/send-tracking-email/index.ts`
- `src/components/dev-panel/DevEmailTracking.tsx`

**Edits:**
- `src/pages/DevPanel.tsx`
- `src/hooks/usePresenceHeartbeat.ts`
- `supabase/functions/processar-autos/index.ts`
- `supabase/functions/prev-pre-processar/index.ts`
- `supabase/functions/extrair-texto-pdf/index.ts`
- `supabase/config.toml`

**SQL via insert (pg_cron):** agenda `send-tracking-email` a cada 5 min.

## Segurança & resiliência

- Todos os disparos são fire-and-forget com `.catch(() => {})` — nunca quebram o fluxo do usuário.
- Config protegida por RLS `is_developer()`.
- Dedup: login (30 min), daily (`last_daily_sent_date`).
- `RESEND_API_KEY` só no backend.
- Rate limit implícito: 1 login/sessão, 1 daily/dia, erros são raros por natureza.

## Passo 0 (assim que entrarmos em build)

Solicitar a `RESEND_API_KEY` via `add_secret` — sem ela, function não sobe.

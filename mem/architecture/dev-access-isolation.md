---
name: Dev access isolation from user domain data
description: Developer/admin access to other users' domain data must go via edge functions, never via permissive RLS policies on user-owned tables
type: constraint
---

## Regra

Acesso do developer (ou admin) aos dados de outros usuários **NUNCA** deve ser implementado como policy RLS permissiva de `SELECT`/`UPDATE`/`DELETE` em tabelas de domínio pertencentes ao usuário final.

Tabelas de domínio (não exaustivo): `prev_pautas`, `prev_pericias`, `laudos`, `financeiro`, `impugnacoes`, `modelos_laudo`, `import_jobs`, `user_settings`, `user_modules`, `profiles`.

**Por quê:** o client faz `select('*')` confiando na RLS. Se existir uma policy `USING (is_developer())` na tabela, quando o developer usa o app normalmente (não o DevPanel), as telas comuns passam a listar dados de todos os clientes misturados aos seus. Foi exatamente isso que expôs as pautas do Bruno (MED001) no painel Previdenciário comum do dev Diogo (MED002).

## Como implementar acesso do dev corretamente

Sempre via edge function dedicada (`dev-*`) que:
1. Roda com `SUPABASE_SERVICE_ROLE_KEY` (bypass de RLS server-side).
2. Valida `is_developer()` internamente antes de responder.
3. É chamada apenas pelo DevPanel.

Exemplos existentes que seguem o padrão: `dev-list-prev-usage`, `dev-get-pericia-data`, `dev-list-pdfs`, `dev-download-pdf`.

## Onde RLS de dev É aceitável

Somente em tabelas puramente operacionais/observabilidade onde não existe conceito de "dono cliente": `backend_logs`, `access_logs`, `error_logs`, `ai_usage_logs`, `import_attempts`, `user_presence`, `system_config`, `email_tracking_config`, `email_tracking_log`, `model_pricing`, `global_api_keys`.

## Checklist antes de criar qualquer nova policy `USING (is_developer())` ou `USING (is_admin())`

- [ ] A tabela é de observabilidade/config global? Se **não**, pare — use edge function.
- [ ] Existe alguma tela comum (não-DevPanel) que faz `select` nessa tabela sem filtro explícito por `user_id`? Se **sim**, a policy vai vazar dados.

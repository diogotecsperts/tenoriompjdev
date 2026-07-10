
## Diagnóstico (dados intactos, confirmado)

Consultei o banco diretamente. Nenhuma pauta foi movida:

- **MED001 (Bruno, `e48a06e4-…`)** — continua dono de **2 pautas** (`18ª VARA FEDERAL - PE`, dias 07 e 08/07).
- **MED002 (Diogo/dev, `b193f4fb-…`)** — dono das **10 pautas** próprias (Arapiraca, Xandó, Ypiranga, Santana, União).

Todos os `user_id` em `prev_pautas` e `prev_pericias` estão preservados. O que aconteceu foi visual: seu painel comum passou a **listar** as pautas do Bruno junto com as suas — mas elas nunca saíram da conta dele.

## Causa raiz

Existem duas policies RLS permissivas de leitura:

```
prev_pautas    → "Developers can view all prev_pautas"    USING (is_developer())
prev_pericias  → "Developers can view all prev_pericias"  USING (is_developer())
```

O client (`src/modules/previdenciario/api/pautas.ts` → `listPautas` / `listPericias`) faz `select('*')` **sem filtrar por `user_id`**, confiando na RLS. Como você é developer, a policy libera todas as linhas de todos os usuários — por isso as pautas do Bruno aparecem no seu Previdenciário comum.

Essas policies provavelmente foram criadas junto com a aba "Controle de uso", mas o **DevPanel não precisa delas**: `dev-list-prev-usage` e `dev-get-pericia-data` usam `SUPABASE_SERVICE_ROLE_KEY` no servidor (bypass total de RLS) e já validam `is_developer()` internamente. Removê-las **não afeta em nada** o Controle de uso.

## Correção

Migration única removendo as duas policies:

```sql
DROP POLICY IF EXISTS "Developers can view all prev_pautas"   ON public.prev_pautas;
DROP POLICY IF EXISTS "Developers can view all prev_pericias" ON public.prev_pericias;
```

Depois disso, o seu painel comum (`/previdenciario`) volta a ver **apenas** as suas próprias pautas, e o acesso aos dados dos clientes continua **exclusivamente** via DevPanel → Controle de uso, como você definiu.

## Blindagem contra recorrência

1. **Regra de arquitetura** (a ser salva em `mem://architecture/dev-access-isolation`):
   > Acesso do developer aos dados de outros usuários NUNCA deve vir de policies RLS permissivas em tabelas de domínio (`prev_pautas`, `prev_pericias`, `laudos`, `financeiro`, `impugnacoes`, `modelos_laudo`, `import_jobs`, `user_settings`, `user_modules`, `profiles`). Sempre via edge function com `SUPABASE_SERVICE_ROLE_KEY` + checagem `is_developer()`. RLS de dev fica restrita a tabelas puramente operacionais/observabilidade (`backend_logs`, `access_logs`, `error_logs`, `ai_usage_logs`, `import_attempts`, `user_presence`, `system_config`, `email_tracking_*`).

2. **Auditoria complementar (informativa, sem alterar nada agora)**: existem policies análogas `is_admin()` em `laudos`, `profiles`, `modelos_laudo`, `impugnacoes`, `financeiro` e uma `is_developer()` em `profiles`. Elas seguem o mesmo padrão de risco — se você tiver um usuário `admin` operando o app, ele verá dados alheios em telas comuns pelo mesmo motivo. Não vou mexer nelas agora porque você só reportou pautas/perícias, mas registro para você decidir depois se quer que eu faça uma varredura completa em outro passo.

## Verificação pós-fix

Depois da migration:

1. `SELECT count(*) FROM prev_pautas` executado como você (JWT autenticado) deve retornar **10** (só as suas).
2. DevPanel → Controle de uso → escolher MED001 deve continuar listando as 2 pautas do Bruno normalmente (usa service-role, não depende da policy removida).
3. Nenhuma alteração nas melhorias recentes (alertas Trabalhista/Previdenciário, ordem do menu do DevPanel, e-mail tracking): a migration só toca RLS de leitura.

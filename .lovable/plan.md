

# Historico de Acesso - Nova Pagina no DevPanel

## Avaliacao de Riscos

### Risco ZERO para o pipeline existente
- Nenhum arquivo de edge function (processar-autos, gerar-resumos, etc.) sera tocado
- Nenhum contexto (AuthContext, LaudoContext, NavigationGuard) sera modificado na logica core
- A unica alteracao no AuthContext sera uma unica linha de INSERT em background apos login bem-sucedido, sem await (fire-and-forget), sem alterar o fluxo de retorno
- Tabelas existentes (laudos, profiles, etc.) nao serao alteradas

### O que e perfeitamente possivel
1. **Registro de logins** - Sim, seguro. Um INSERT fire-and-forget apos `signInWithPassword` retornar sucesso
2. **Laudos finalizados** - Sim, sem codigo novo. A tabela `laudos` ja tem `created_at` e `user_id`, basta consultar
3. **Filtro Dev vs Usuarios** - Sim, trivial. Ja temos 2 usuarios no profiles (Diogo=dev, Bruno=user)
4. **Status online/offline** - Sim, possivel via heartbeat. Um pequeno hook que atualiza `last_seen_at` a cada 60s numa tabela `user_presence`

### Unico ponto de atencao
O heartbeat de presenca adiciona uma chamada ao Supabase a cada 60s por usuario conectado. Com 2 usuarios, isso e irrelevante. Sera implementado como um hook isolado (`usePresenceHeartbeat`) que roda apenas quando o usuario esta autenticado, sem interferir em nenhum fluxo existente.

---

## Alteracoes

### 1. Migration: Criar tabelas `access_logs` e `user_presence`

```sql
-- Tabela de logs de acesso (logins)
CREATE TABLE public.access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL DEFAULT 'login',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

-- Somente devs podem ler
CREATE POLICY "Developers can view access_logs"
  ON public.access_logs FOR SELECT
  USING (is_developer());

-- Qualquer autenticado pode inserir (para registrar proprio login)
CREATE POLICY "Authenticated can insert own access_logs"
  ON public.access_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Devs podem limpar
CREATE POLICY "Developers can delete access_logs"
  ON public.access_logs FOR DELETE
  USING (is_developer());

-- Tabela de presenca (heartbeat)
CREATE TABLE public.user_presence (
  user_id uuid PRIMARY KEY,
  last_seen_at timestamptz DEFAULT now(),
  is_online boolean DEFAULT true
);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

-- Devs podem ler tudo
CREATE POLICY "Developers can view presence"
  ON public.user_presence FOR SELECT
  USING (is_developer());

-- Usuarios atualizam propria presenca
CREATE POLICY "Users can upsert own presence"
  ON public.user_presence FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own presence"
  ON public.user_presence FOR UPDATE
  USING (auth.uid() = user_id);
```

### 2. Hook: `src/hooks/usePresenceHeartbeat.ts` (novo arquivo)

Hook isolado que:
- Executa um UPSERT em `user_presence` a cada 60 segundos
- Envia `is_online: true` e `last_seen_at: now()`
- No unmount (fechar aba), envia `is_online: false` via `navigator.sendBeacon` ou update final
- Usado apenas no `AppLayout` (rotas protegidas), sem tocar no AuthContext

### 3. AuthContext: Adicionar 1 linha de log apos login

No `AuthContext.tsx`, dentro da funcao `login`, apos `if (data.user)` retornar true (linha 291-294), adicionar:

```typescript
if (data.user) {
  // Fire-and-forget: registrar acesso sem bloquear login
  supabase.from('access_logs').insert({
    user_id: data.user.id,
    event_type: 'login',
    metadata: { method: identifier.includes('@') ? 'email' : 'user_id' }
  } as any).then(() => {});
  
  return true;
}
```

Isso e completamente seguro: nao usa await, nao altera o fluxo, e se falhar, falha silenciosamente.

### 4. AppLayout: Ativar heartbeat

No `src/components/layout/AppLayout.tsx`, adicionar o hook:

```typescript
import { usePresenceHeartbeat } from "@/hooks/usePresenceHeartbeat";
// dentro do componente:
usePresenceHeartbeat();
```

### 5. Componente: `src/components/dev-panel/DevAccessHistory.tsx` (novo)

Pagina com:
- **Filtro** no topo: Select com opcoes "Todos", "Dev (Diogo)", "Usuarios" que filtra por user_id
- **Cards de presenca**: Para cada usuario, um card com avatar, nome, e indicador verde (online) ou vermelho (offline). Online = `last_seen_at` < 2 minutos atras
- **Tabela de logins**: Lista de access_logs com data/hora, usuario, metodo de login
- **Tabela de laudos criados**: Query na tabela `laudos` filtrando por `status != 'rascunho'` (laudos finalizados), mostrando titulo, data de criacao, usuario
- Auto-refresh a cada 30 segundos para atualizar presenca

### 6. DevPanel.tsx: Registrar nova aba

Adicionar ao type `DevTab`:
```typescript
type DevTab = "dashboard" | ... | "access-history" | "settings";
```

Adicionar ao `navItems`:
```typescript
{ id: "access-history", label: "Historico de Acesso", icon: History }
```

Adicionar ao `renderContent`:
```typescript
case "access-history":
  return <DevAccessHistory />;
```

---

## O que NAO muda (garantia)

- `processar-autos/index.ts` - intocado
- `seed-prompts/index.ts` - intocado
- `sanitizeOcrAccents` - intocado
- `LaudoContext.tsx` - intocado
- `NavigationGuardContext.tsx` - intocado
- `ImportarAutosDialog.tsx` - intocado
- Tabelas existentes (laudos, profiles, etc.) - nenhuma alteracao de schema
- Fluxo de login - a unica adicao e um INSERT fire-and-forget que nao pode afetar o retorno da funcao


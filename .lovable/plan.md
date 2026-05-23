
# Plano Arquitetural — Hub Multi-Módulos (Trabalhista + Previdenciário)

## 1. Crítica ao plano original (antes de aprovar a execução)

Antes de detalhar a solução, preciso te alertar sobre **dois pontos do plano do Gemini que, se executados como descritos, geram risco real de quebra do módulo Trabalhista** — exatamente o que sua regra máxima proíbe:

### 1.1 Mover o app atual de `/` para `/trabalhista` é a abordagem mais perigosa possível

Hoje existem **rotas hardcoded espalhadas por todo o código**:

- `AppLayout.tsx`: `/dashboard`, `/laudo/new`, `/historico`, `/financeiro`, `/impugnacao`, `/configuracoes`, `/dev-panel`
- `Dashboard.tsx`: 4 `navigate('/historico'|'/financeiro')`
- `Historico.tsx`: 2 `navigate('/laudo/new')`
- `Login.tsx`, `AuthContext.tsx`, `DevPanel.tsx`, `ProtectedRoute.tsx`, `DevProtectedRoute.tsx`, `NotFound.tsx`: redirects para `/`, `/dashboard`
- `NavigationGuardContext`: compara `location.pathname.startsWith("/laudo/")` — quebraria com `/trabalhista/laudo/`
- `LaudoEditor` usa `useParams` em `/laudo/:id` — qualquer mudança de prefixo precisa propagar
- Testes em `src/test/navigation.test.tsx` referenciam `/dashboard`, `/historico`
- Bookmarks dos usuários já em produção (`https://brunobetav2.tecsperts.com/dashboard`, `/historico`, etc.) **quebrariam**

Renomear tudo para `/trabalhista/*` exigiria editar **18+ arquivos críticos** e cada um é um ponto de falha silenciosa. **Recomendo NÃO mover**.

### 1.2 `array modulos_acessiveis` em `profiles` é frágil
Arrays em `jsonb`/`text[]` são chatos de filtrar via RLS e de manter no DevPanel. Uma tabela relacional `user_modules` é trivial, mais segura e auditável.

---

## 2. Proposta revisada (segura, reversível, zero-impacto no Trabalhista)

### Princípio: **aditivo, nunca substitutivo**

O Trabalhista permanece **literalmente intacto** nas rotas atuais. O Hub e o Previdenciário são **adicionados ao lado**, não por cima.

---

## 3. Arquitetura de Roteamento

```text
/                       → Login (inalterado)
/hub                    → NOVO: Hub de módulos (pós-login)
/dashboard              → Trabalhista (INALTERADO — é o "home" do módulo trabalhista)
/laudo/new, /laudo/:id  → Trabalhista (INALTERADO)
/historico              → Trabalhista (INALTERADO)
/financeiro             → Trabalhista (INALTERADO)
/impugnacao             → Trabalhista (INALTERADO)
/configuracoes          → Compartilhado (INALTERADO)
/dev-panel              → Compartilhado (INALTERADO)

/previdenciario                  → NOVO: home do módulo previdenciário
/previdenciario/laudo/new        → NOVO
/previdenciario/laudo/:id        → NOVO
/previdenciario/historico        → NOVO
...etc (namespace próprio, isolado)
```

**Por que NÃO mover Trabalhista para `/trabalhista/*`:**
- Zero edição em `AppLayout`, `Dashboard`, `Historico`, `Login`, `AuthContext`, `LaudoEditor`, `NavigationGuard`, testes
- Bookmarks/URLs publicadas continuam funcionando
- Rollback do Hub = 1 linha (mudar redirect pós-login de `/hub` para `/dashboard`)

**O que muda em redirecionamento:**
- `Login.tsx`: `navigate("/dashboard")` → `navigate("/hub")` (1 linha)
- `AuthContext.logout`: continua `navigate("/")` (inalterado)
- `DevPanel "Dashboard Médico"`: passa a apontar para `/hub` (1 linha)

### 3.1 Hub `/hub` (novo)
Componente novo `src/pages/Hub.tsx` dentro de `AppLayout` (ou layout próprio mais limpo, sem sidebar Trabalhista — recomendo **layout próprio** para o Hub não “vazar” o menu Trabalhista). Renderiza cards dos módulos que o usuário tem permissão:

```text
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Trabalhista  │  │Previdenciário│  │ (futuro: Cível)│
│ → /dashboard │  │→/previdencia.│  │   bloqueado   │
└──────────────┘  └──────────────┘  └──────────────┘
```

### 3.2 Layout do Previdenciário
Novo `PrevidenciarioLayout` (clone visual do `AppLayout` mas com seu próprio `mainMenuItems` apontando para `/previdenciario/*`). **Não reutilizar `AppLayout` direto** para não criar acoplamento bidirecional — duplicar o shell é mais barato a longo prazo do que parametrizar.

Botão “Trocar de módulo” em ambos os layouts → volta para `/hub`.

---

## 4. Migração mínima de Banco de Dados

### 4.1 Tabela `user_modules` (nova — relacional, RLS-friendly)
```sql
CREATE TYPE app_module AS ENUM ('trabalhista', 'previdenciario');

CREATE TABLE public.user_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module app_module NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, module)
);
ALTER TABLE public.user_modules ENABLE ROW LEVEL SECURITY;

-- Função SECURITY DEFINER (evita recursão RLS)
CREATE FUNCTION public.has_module(_uid uuid, _mod app_module)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_modules
                 WHERE user_id=_uid AND module=_mod AND enabled=true)
$$;

-- Policies: usuário lê o próprio; developer/admin gerencia tudo
```

**Backfill seguro (zero quebra)**: dar `trabalhista=true` a TODOS os usuários existentes:
```sql
INSERT INTO user_modules (user_id, module, enabled)
SELECT id, 'trabalhista', true FROM profiles
ON CONFLICT DO NOTHING;
```
E adicionar ao `handle_new_user()` trigger: novo usuário ganha `trabalhista` automático. **Resultado: nenhum usuário existente perde acesso a nada.**

### 4.2 Coluna `tipo_laudo` em `laudos` (mínima, com default seguro)
```sql
ALTER TABLE public.laudos
  ADD COLUMN tipo_laudo app_module NOT NULL DEFAULT 'trabalhista';
CREATE INDEX idx_laudos_user_tipo ON laudos(user_id, tipo_laudo);
```

- Default `'trabalhista'` → **todos os 100% dos laudos atuais ficam marcados como trabalhistas** sem nenhum UPDATE em massa retroativo.
- O frontend Trabalhista atual **não precisa filtrar nada** (continua lendo todos os `laudos` do user — só verá os dele, e como todos novos do módulo são `trabalhista`, nada muda visualmente). Para isolamento futuro, podemos adicionar `.eq('tipo_laudo','trabalhista')` nas queries do Historico/Dashboard em fase 2 — **opcional e reversível**.
- O Previdenciário sempre insere com `tipo_laudo='previdenciario'` e sempre filtra por isso.

### 4.3 RLS de `laudos` — **não muda**
Continua `auth.uid() = user_id`. O `tipo_laudo` é filtro de aplicação, não de segurança (o dono é o mesmo).

### 4.4 Edge functions — **zero alterações na fase 1**
`processar-autos`, `gerar-justificativa-medica`, `gerar-quesitos`, `gerar-resumos` etc. continuam idênticas. Quando o Previdenciário precisar de lógica específica, adicionaremos um parâmetro opcional `tipo_laudo` no payload (default `'trabalhista'`) — totalmente retrocompatível.

---

## 5. Controle no DevPanel

Nova aba **“Módulos por Usuário”** em `DevPanel`:
- Lista usuários (já existe em `DevUsersList`)
- Por linha: toggles `[ Trabalhista ] [ Previdenciário ]` que fazem UPSERT em `user_modules`
- Protegido por `is_developer()` (RLS já cuida)
- **Não toca em nada existente** — é uma aba adicional

---

## 6. Guardas de acesso por módulo

Novo wrapper `<ModuleProtectedRoute module="previdenciario">` que:
1. Reusa `ProtectedRoute` (auth)
2. Chama RPC `has_module(auth.uid(), 'previdenciario')`
3. Se falso → redireciona pra `/hub` com toast “Módulo não habilitado”

O `/dashboard` (Trabalhista) **opcionalmente** ganha o mesmo guard com `module="trabalhista"`. Como o backfill dá `trabalhista=true` a todos, isso não bloqueia ninguém — mas dá ao DevPanel o poder de revogar acesso depois.

---

## 7. Sequência de execução proposta (fases pequenas e validáveis)

| Fase | Escopo | Risco | Reversível? |
|------|--------|-------|-------------|
| **F1** | Migração SQL: `user_modules` + `tipo_laudo` + backfill + trigger | Baixo | Sim (drop) |
| **F2** | DevPanel: aba “Módulos por Usuário” | Zero (aditivo) | Sim |
| **F3** | Página `/hub` + redirect pós-login `Login.tsx` (1 linha) | Baixo | Sim (reverter linha) |
| **F4** | `PrevidenciarioLayout` + rotas `/previdenciario/*` (páginas placeholder) | Zero (não toca Trabalhista) | Sim |
| **F5** | Implementação real das telas Previdenciárias | Isolado | Sim |

**Após cada fase**: smoke test no Trabalhista (login → dashboard → criar laudo → importar autos → exportar DOCX). Só avança se 100% verde.

---

## 8. Pontos onde divirjo do plano original — resumo executivo

| Ponto do Gemini | Minha recomendação | Motivo |
|---|---|---|
| Mover app para `/trabalhista` | **Manter rotas atuais** | 18+ arquivos editados = risco real de quebra; bookmarks em produção quebram |
| Array `modulos_acessiveis` em `profiles` | **Tabela `user_modules` + função `has_module()`** | RLS limpa, auditável, performance |
| Adicionar `tipo_laudo` (concordo) | **Concordo, com `DEFAULT 'trabalhista'` + backfill implícito** | Zero migração de dados retroativa |
| Hub como nova rota inicial (concordo) | **Concordo, em `/hub` com layout próprio** | Não polui sidebar Trabalhista |

---

## 9. O que esse plano **garante**

- **0 (zero) edições** em: `LaudoEditor`, `LaudoContext`, `AppLayout`, `Dashboard`, `Historico`, `Financeiro`, `Impugnacao`, `Configuracoes`, `NavigationGuard`, edge functions, exporters DOCX/PDF
- **0 UPDATEs retroativos** em laudos existentes
- **0 mudança** nas RLS atuais de `laudos`/`profiles`
- **0 quebra** de URLs/bookmarks em produção
- Rollback total possível a qualquer momento drop-ando 2 objetos (`user_modules`, `tipo_laudo`) e revertendo 1 linha em `Login.tsx`

Aguardando sua aprovação para iniciar pela **Fase 1 (migração SQL)**.

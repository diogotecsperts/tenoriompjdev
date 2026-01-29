

# Análise de Segurança: Sincronização Global das Configurações do DevPanel

## Resumo Executivo

Você identificou uma falha crítica de design que causou os erros de autenticação (401) na conta do médico. A boa notícia é que **todas as correções já foram aplicadas** e o sistema agora está sincronizado corretamente.

---

## O Que Estava Acontecendo

### Problema 1: Configurações Não Eram Lidas por Usuários Normais

**Causa Raiz:** A tabela `system_config` tinha políticas de segurança (RLS) que só permitiam leitura para desenvolvedores e admins.

```text
┌─────────────────────────────────────────────────────────────┐
│                   ANTES (Problema)                          │
├─────────────────────────────────────────────────────────────┤
│  Você (developer)                                           │
│    ↓                                                        │
│  DevPanel → Salva em system_config                          │
│    ↓                                                        │
│  RLS: "Só is_developer() pode SELECT"                       │
│    ↓                                                        │
│  Dr. Bruno (user) → ❌ Bloqueado → Usa fallback 50MB        │
└─────────────────────────────────────────────────────────────┘
```

**Correção Aplicada:** Migration que adiciona policy de leitura para todos os usuários autenticados.

```text
┌─────────────────────────────────────────────────────────────┐
│                    AGORA (Corrigido)                        │
├─────────────────────────────────────────────────────────────┤
│  Você (developer)                                           │
│    ↓                                                        │
│  DevPanel → Salva em system_config                          │
│    ↓                                                        │
│  RLS: "Authenticated pode SELECT" ✅                        │
│    ↓                                                        │
│  Dr. Bruno (user) → ✅ Lê configs → 100MB, AI correto       │
└─────────────────────────────────────────────────────────────┘
```

### Problema 2: Autenticação Falhava em Imports Longos (401)

**Causa Raiz:** O edge function `check-import-status` usava `auth.getUser()` que falha quando a sessão fica "stale" durante processos longos (10+ minutos).

**Correção Aplicada:** O edge function agora usa o token JWT diretamente com RLS, sem fazer lookup de sessão:

```text
ANTES: Polling → getUser() → "Session not found" → 401 ❌
AGORA: Polling → RLS verifica JWT → Query funciona ✅
```

---

## Status Atual: O Que Está Sincronizado

### Configurações Globais (✅ Funcionando para todos)

| Configuração | Valor no DevPanel | Aplica para Todos |
|--------------|-------------------|-------------------|
| `max_pdf_size_mb` | 100 | ✅ Sim |
| `default_ai_provider` | openrouter | ✅ Sim |
| `default_ai_model` | google/gemini-3-flash-preview | ✅ Sim |
| `fallback_ai_provider` | openrouter | ✅ Sim |
| `fallback_ai_model` | google/gemini-3-flash-preview | ✅ Sim |
| `favorite_models_*` | Modelos favoritados | ✅ Sim |

### Prompts de IA (✅ Idênticos para todos)

Os prompts são **hardcoded nos edge functions**, não são configuráveis por usuário. Isso significa que:

- O prompt de extração de PDF (`processar-autos`) é **idêntico** para você e para o Dr. Bruno
- O prompt de regeneração de campos (`regerar-campo-pdf`) é **idêntico** para todos
- O prompt de geração de resumos (`gerar-resumos`) é **idêntico** para todos

**Não há diferença de qualidade de extração entre usuários.**

---

## Arquitetura de Segurança Atual

```text
┌─────────────────────────────────────────────────────────────┐
│                    DevPanel (/dev)                          │
│         Acesso: APENAS is_developer() ✅                    │
├─────────────────────────────────────────────────────────────┤
│  DevProtectedRoute.tsx                                      │
│    → Verifica supabase.rpc("is_developer")                  │
│    → Redireciona se não for developer                       │
├─────────────────────────────────────────────────────────────┤
│  system_config (tabela)                                     │
│    → SELECT: authenticated (todos podem LER)                │
│    → INSERT/UPDATE/DELETE: apenas is_developer()            │
├─────────────────────────────────────────────────────────────┤
│  global_api_keys (tabela)                                   │
│    → Todas operações: apenas is_developer()                 │
│    → Chaves de API ficam protegidas                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Pontos de Atenção para Futuras Alterações

### O Que Continuará Funcionando Automaticamente

Qualquer alteração que você fizer no DevPanel nas seguintes áreas será aplicada **imediatamente** para todos os usuários:

1. **Limite de PDF** - Mudar de 100MB para 200MB? Aplica para todos
2. **Modelo de IA padrão** - Trocar para GPT-5? Aplica para todos
3. **Provider de IA** - Mudar de OpenRouter para Lovable? Aplica para todos
4. **Configurações de retry** - Habilitar/desabilitar retries? Aplica para todos
5. **Modelos favoritos** - Adicionar novos modelos? Aplica para todos

### O Que Requer Atenção

1. **Novas Edge Functions** - Se eu criar novas edge functions, preciso garantir que:
   - Usem `getAIConfig()` de `_shared/ai-config.ts` (já lê global)
   - Não façam `auth.getUser()` em processos longos
   - Usem RLS quando possível para autenticação

2. **Novas Configurações** - Se adicionar novas configs ao DevPanel:
   - Já serão lidas por todos (RLS já permite)
   - Frontend precisa buscar de `system_config`

---

## Garantia de Estabilidade

A arquitetura agora segue um padrão sólido:

```text
┌─────────────────────────────────────────────────────────────┐
│  1. DevPanel salva em system_config                         │
│              ↓                                              │
│  2. RLS permite leitura para todos autenticados             │
│              ↓                                              │
│  3. Frontend/Backend leem de system_config                  │
│              ↓                                              │
│  4. Configuração aplicada uniformemente                     │
└─────────────────────────────────────────────────────────────┘
```

**Não haverá mais casos onde um usuário usa fallback enquanto outro usa a configuração correta.**

---

## Recomendação de Teste

Para confirmar que tudo está funcionando:

1. **Faça login como Dr. Bruno**
2. **Acesse a ferramenta Importar Autos**
3. **Verifique no diálogo:**
   - O limite exibido é 100MB (não 50MB)
   - O modelo de IA mostrado é gemini-3-flash-preview
4. **Importe um PDF e acompanhe o polling até o fim**
   - Não deve aparecer erro 401

Se esses 4 pontos funcionarem, o sistema está 100% sincronizado.


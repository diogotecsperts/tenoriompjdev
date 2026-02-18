
# Sincronização: Configuração Global de IA → Tela de Usuários

## O Problema

Existem dois sistemas paralelos que nunca se conversaram:

| Sistema | Onde fica | Valor atual |
|---------|-----------|-------------|
| Configuração Global (DevPanel > Configurações) | Tabela `system_config` | `openrouter` ✅ |
| Configuração por Usuário (DevPanel > Usuários) | Tabela `user_settings` | `lovable` ❌ |

O banco criou todos os usuários com `ai_provider = 'lovable'` porque esse era o DEFAULT da coluna. Esse valor nunca foi sincronizado com o que você configurou no DevPanel.

## O que será feito

### 1. Migração SQL — corrigir o DEFAULT da coluna e dados existentes

Alterar o default da coluna `ai_provider` na tabela `user_settings` de `'lovable'` para `'gemini'` (provider seguro e real), e atualizar os registros existentes que ainda têm `'lovable'` para refletir o provider global atual (`openrouter`):

```sql
-- Corrigir default da coluna
ALTER TABLE user_settings ALTER COLUMN ai_provider SET DEFAULT 'gemini';

-- Atualizar usuários existentes com 'lovable' para o provider global atual
UPDATE user_settings 
SET ai_provider = 'openrouter',
    ai_model = 'google/gemini-3-flash-preview'
WHERE ai_provider = 'lovable';
```

### 2. `DevUsersList.tsx` — corrigir fallback e exibição

**Linha 116** — Trocar fallback de `"lovable"` para `"gemini"`:
```typescript
ai_provider: userSettings?.ai_provider || "gemini",
```

**Linha 353** — Adicionar função de mapeamento para exibir nome legível no badge (nunca mostrar o valor bruto):
```typescript
const getProviderLabel = (provider: string): string => {
  const labels: Record<string, string> = {
    openrouter: "OpenRouter",
    gemini: "Google Gemini",
    openai: "OpenAI",
    claude: "Anthropic Claude",
    groq: "Groq",
    deepseek: "DeepSeek",
    mistral: "Mistral",
    "mistral-ocr": "Mistral OCR",
    lovable: "IA Integrada (backup)", // nunca deve aparecer normalmente
  };
  return labels[provider] || provider;
};
```

Substituir `{user.ai_provider}` por `{getProviderLabel(user.ai_provider)}` no badge da tabela.

### 3. `DevUserSettings.tsx` — corrigir estado inicial e fallbacks

**Linha 113** — Trocar default do formulário:
```typescript
const DEFAULT_SETTINGS: UserSettings = {
  ai_provider: "gemini", // era "lovable"
  ...
};
```

**Linha 170** — Trocar fallback no `fetchSettings`:
```typescript
ai_provider: data.ai_provider || "gemini", // era "lovable"
```

**Linha 50** — Renomear label para deixar claro que é backup:
```typescript
{ id: "lovable", name: "IA Integrada (backup)", requiresKey: false },
```

## O que NÃO muda

A tela de usuários continua permitindo configuração individual por usuário — isso é útil para você no futuro, por exemplo, para dar a um usuário específico uma API key própria ou um limite diferente. A diferença é que agora o **ponto de partida** será o provider real (openrouter), não "lovable".

## Resultado esperado

| Situação | Antes | Depois |
|----------|-------|--------|
| Badge "Provider IA" na tabela | Mostra "lovable" | Mostra "OpenRouter" |
| Formulário de edição de usuário | Abre com "IA Integrada" selecionado | Abre com "OpenRouter" selecionado |
| Novos usuários criados futuramente | Nascem com "lovable" | Nascem com "gemini" |
| Usuários existentes no banco | Têm "lovable" salvo | Serão atualizados para "openrouter" via migration |

## Arquivos alterados

| Arquivo | Tipo de mudança |
|---------|----------------|
| Migration SQL | Alterar DEFAULT + UPDATE dados existentes |
| `src/components/dev-panel/DevUsersList.tsx` | Fallback + mapeamento de label no badge |
| `src/components/dev-panel/DevUserSettings.tsx` | DEFAULT_SETTINGS + fallback + label do provider |

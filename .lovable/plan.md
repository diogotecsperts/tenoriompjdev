
# Plano Completo: Sincronização + Aviso Visual + Botão "Sincronizar com Global"

## Estado atual confirmado

- Banco de dados: `default_ai_provider = "openrouter"`, `default_ai_model = "google/gemini-3-flash-preview"` na tabela `system_config`
- Tabela `user_settings`: coluna `ai_provider` ainda tem `DEFAULT 'lovable'`  
- `DevUserSettings.tsx` linha 50: label ainda `"IA Integrada"` (sem "backup")
- `DevUserSettings.tsx` linha 113: `DEFAULT_SETTINGS.ai_provider = "lovable"`
- `DevUserSettings.tsx` linha 170: fallback `|| "lovable"`
- `DevUsersList.tsx` linha 116: fallback `|| "lovable"`
- `DevUsersList.tsx` linha 353: exibe `{user.ai_provider}` bruto

---

## O que será feito (plano integrado)

### Parte 1 — Migração SQL

```sql
-- Trocar default da coluna para provider real
ALTER TABLE user_settings ALTER COLUMN ai_provider SET DEFAULT 'gemini';

-- Atualizar usuários existentes que têm 'lovable' para o provider global atual
UPDATE user_settings 
SET ai_provider = 'openrouter',
    ai_model = 'google/gemini-3-flash-preview'
WHERE ai_provider = 'lovable' OR ai_provider IS NULL;
```

---

### Parte 2 — `DevUserSettings.tsx`: 5 mudanças

**2a. Linha 50** — Label do provider lovable:
```typescript
{ id: "lovable", name: "IA Integrada (backup)", requiresKey: false },
```

**2b. Linha 113** — DEFAULT_SETTINGS:
```typescript
ai_provider: "gemini", // era "lovable"
```

**2c. Linha 170** — Fallback no fetchSettings:
```typescript
ai_provider: data.ai_provider || "gemini", // era "lovable"
```

**2d. Botão "Sincronizar com Global"** — Nova função + estado que busca as configs do `system_config` e as aplica no formulário do usuário:

```typescript
const [syncing, setSyncing] = useState(false);

const handleSyncWithGlobal = async () => {
  setSyncing(true);
  try {
    const { data, error } = await supabase
      .from("system_config")
      .select("id, value")
      .in("id", ["default_ai_provider", "default_ai_model"]);

    if (error) throw error;

    const config: Record<string, string> = {};
    data?.forEach((row) => { config[row.id] = row.value as string; });

    setSettings(prev => ({
      ...prev,
      ai_provider: config.default_ai_provider || "gemini",
      ai_model: config.default_ai_model || "google/gemini-3-flash-preview",
    }));

    toast({
      title: "Sincronizado",
      description: "Provider e modelo copiados das configurações globais. Clique em Salvar para aplicar.",
    });
  } catch (error) {
    toast({ variant: "destructive", title: "Erro", description: "Falha ao buscar configurações globais" });
  } finally {
    setSyncing(false);
  }
};
```

**2e. Aviso visual + botão** — Inserir logo acima da seção "Configurações de IA" (linha ~354), antes do `<h3>`:

```tsx
{/* Aviso de hierarquia + botão Sincronizar */}
<div className="flex items-start justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20 p-3">
  <div className="flex items-start gap-2">
    <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
    <p className="text-xs text-amber-700 dark:text-amber-300">
      Configurações individuais <strong>substituem</strong> as configurações globais do DevPanel para este usuário.
    </p>
  </div>
  <Button
    variant="outline"
    size="sm"
    onClick={handleSyncWithGlobal}
    disabled={syncing}
    className="shrink-0 text-xs h-7 border-amber-300 hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/30"
  >
    {syncing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
    Sincronizar com Global
  </Button>
</div>
```

Adicionar `Info` e `RefreshCw` ao import de `lucide-react` (linha 18).

---

### Parte 3 — `DevUsersList.tsx`: 3 mudanças

**3a. Linha 116** — Fallback no merge de perfis:
```typescript
ai_provider: userSettings?.ai_provider || "gemini",
```

**3b. Antes da função `fetchUsers`** — Adicionar função de mapeamento de label:
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
    lovable: "IA Integrada (backup)",
  };
  return labels[provider] || provider;
};
```

**3c. Linhas 350-354** — Substituir badge bruto:
```tsx
// ANTES:
<Badge variant={user.ai_provider === "lovable" ? "default" : "secondary"}>
  {user.ai_provider}
</Badge>

// DEPOIS:
<Badge variant="secondary">
  {getProviderLabel(user.ai_provider)}
</Badge>
```

---

## Resultado visual final

O modal de edição de usuário ficará assim na seção de IA:

```text
┌─────────────────────────────────────────────────────────┐
│ ⚠ Configurações individuais substituem as configurações  │
│   globais do DevPanel para este usuário.    [↺ Sincronizar com Global] │
└─────────────────────────────────────────────────────────┘

Configurações de IA
  Provider de IA: [OpenRouter        ▼]   Modelo: [gemini-3-flash ▼]
```

E na tabela de usuários, a coluna "Provider IA" mostrará:
- `"OpenRouter"` em vez de `"openrouter"`
- `"Google Gemini"` em vez de `"gemini"`
- Nunca mais `"lovable"` em texto visível

---

## Arquivos alterados

| Arquivo | Mudanças |
|---------|----------|
| Migration SQL | `ALTER DEFAULT` + `UPDATE` dados existentes |
| `src/components/dev-panel/DevUserSettings.tsx` | Label backup + DEFAULT_SETTINGS + fallback + aviso visual + botão Sincronizar |
| `src/components/dev-panel/DevUsersList.tsx` | Fallback + `getProviderLabel` + badge mapeado |

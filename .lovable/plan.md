
# Execução Definitiva: Sincronização Global de IA + Aviso Visual + Botão Sincronizar

## Por que parou antes

O sistema estava em "modo leitura" (plan mode) quando tentou executar. Isso impediu qualquer alteração de arquivo. Desta vez, ao aprovar, a execução começa imediatamente.

---

## O que será alterado (3 partes, sequência exata)

### Parte 1 — Banco de dados: 2 comandos SQL

**Comando 1** — Trocar o DEFAULT da coluna `ai_provider` de `'lovable'` para `'gemini'`:
- Efeito: novos usuários criados futuramente não nascem mais com "lovable"

**Comando 2** — Atualizar os registros existentes:
- Todos os usuários que têm `ai_provider = 'lovable'` serão atualizados para `openrouter` (o provider configurado globalmente no DevPanel) com modelo `google/gemini-3-flash-preview`

---

### Parte 2 — `src/components/dev-panel/DevUserSettings.tsx`: 6 mudanças

**Linha 18** — Adicionar `Info` e `RefreshCw` ao import do lucide-react:
```typescript
import { Loader2, Shield, Info, RefreshCw } from "lucide-react";
```

**Linha 50** — Renomear label do provider lovable para deixar claro que é backup:
```typescript
{ id: "lovable", name: "IA Integrada (backup)", requiresKey: false },
```

**Linha 113** — Trocar DEFAULT_SETTINGS para não abrir com "lovable":
```typescript
ai_provider: "openrouter",
```

**Linha 141** — Adicionar estado `syncing` após o estado `saving`:
```typescript
const [syncing, setSyncing] = useState(false);
```

**Linha 170** — Trocar fallback no fetchSettings:
```typescript
ai_provider: data.ai_provider || "openrouter",
```

**Linhas 352-356** — Inserir aviso visual + botão "Sincronizar com Global" entre o `<Separator />` e o `<h3>` de "Configurações de IA". Também adicionar a função `handleSyncWithGlobal` antes do `return`:

```typescript
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
      ai_provider: config.default_ai_provider || "openrouter",
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

E o bloco visual:
```tsx
{/* Aviso de hierarquia + botão Sincronizar */}
<div className="flex items-start justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20 p-3 mb-2">
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

---

### Parte 3 — `src/components/dev-panel/DevUsersList.tsx`: 3 mudanças

**Linha 116** — Trocar fallback no merge de perfis:
```typescript
ai_provider: userSettings?.ai_provider || "openrouter",
```

**Antes da função `fetchUsers` (linha ~85)** — Adicionar função de mapeamento de labels legíveis:
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

**Linhas 350-354** — Substituir badge bruto pelo badge com label mapeado:
```tsx
// ANTES (mostra "lovable" bruto):
<Badge variant={user.ai_provider === "lovable" ? "default" : "secondary"}>
  {user.ai_provider}
</Badge>

// DEPOIS (mostra "OpenRouter", "Google Gemini", etc.):
<Badge variant="secondary">
  {getProviderLabel(user.ai_provider)}
</Badge>
```

---

## Resultado final

| Situação | Antes | Depois |
|----------|-------|--------|
| Badge na tabela de usuários | Mostra "lovable" | Mostra "OpenRouter" |
| Formulário de edição ao abrir | Abre com "IA Integrada" selecionado | Abre com "OpenRouter" selecionado |
| Usuários existentes no banco | `ai_provider = 'lovable'` | Atualizados para `openrouter` |
| Novos usuários futuros | Nascem com `lovable` | Nascem com `gemini` |
| Aviso visual no modal de edição | Não existe | Box âmbar explicando hierarquia + botão Sincronizar |
| Botão "Sincronizar com Global" | Não existe | Copia provider e modelo do `system_config` para o formulário |

---

## Arquivos alterados

| Arquivo | Mudanças |
|---------|----------|
| Banco de dados (SQL direto) | ALTER DEFAULT + UPDATE dados existentes |
| `src/components/dev-panel/DevUserSettings.tsx` | Import + label backup + DEFAULT + fallback + função sync + UI âmbar |
| `src/components/dev-panel/DevUsersList.tsx` | Fallback + getProviderLabel + badge mapeado |


# Botão "Sincronizar Todos" + Indicador Visual de Sincronização

## Diagnóstico: o que já existe vs. o que falta

| Funcionalidade | Status |
|----------------|--------|
| Badge com nome amigável do provider | Implementado |
| Aviso âmbar no modal individual | Implementado |
| Botão "Sincronizar com Global" no modal individual | Implementado |
| **Botão "Sincronizar Todos" no cabeçalho** | Faltando |
| **Indicador visual por linha (sincronizado/customizado)** | Faltando |

Configuração global atual confirmada no banco: `openrouter` + `google/gemini-3-flash-preview`.

---

## O que será feito — somente `DevUsersList.tsx`

### Mudança 1 — Estado e lógica do "Sincronizar Todos"

Adicionar 3 novos estados após os existentes:

```typescript
const [syncAllDialogOpen, setSyncAllDialogOpen] = useState(false);
const [syncingAll, setSyncingAll] = useState(false);
const [globalConfig, setGlobalConfig] = useState<{ provider: string; model: string } | null>(null);
```

Adicionar função `fetchGlobalConfig` que busca `default_ai_provider` e `default_ai_model` do `system_config`:

```typescript
const fetchGlobalConfig = async () => {
  const { data } = await supabase
    .from("system_config")
    .select("id, value")
    .in("id", ["default_ai_provider", "default_ai_model"]);
  const cfg: Record<string, string> = {};
  data?.forEach(row => { cfg[row.id] = row.value as string; });
  setGlobalConfig({
    provider: cfg.default_ai_provider || "openrouter",
    model: cfg.default_ai_model || "google/gemini-3-flash-preview",
  });
};
```

Adicionar `handleSyncAll` que faz upsert em massa para todos os usuários:

```typescript
const handleSyncAll = async () => {
  if (!globalConfig) return;
  setSyncingAll(true);
  try {
    // Buscar todos os user_ids dos perfis
    const userIds = users.map(u => u.id);
    
    // Upsert em batch: aplicar provider e model global para todos
    const { error } = await supabase
      .from("user_settings")
      .upsert(
        userIds.map(uid => ({
          user_id: uid,
          ai_provider: globalConfig.provider,
          ai_model: globalConfig.model,
        })),
        { onConflict: "user_id" }
      );
    
    if (error) throw error;
    
    toast({
      title: "Todos sincronizados",
      description: `${userIds.length} usuário(s) atualizados para ${getProviderLabel(globalConfig.provider)}.`,
    });
    setSyncAllDialogOpen(false);
    fetchUsers(); // Recarregar tabela
  } catch (error) {
    toast({ variant: "destructive", title: "Erro", description: "Falha ao sincronizar usuários" });
  } finally {
    setSyncingAll(false);
  }
};
```

Chamar `fetchGlobalConfig` dentro do `useEffect` junto com `fetchUsers`.

---

### Mudança 2 — Indicador visual por linha (sincronizado/customizado)

Adicionar função auxiliar `isUserSynced` que compara o provider/model do usuário com o global:

```typescript
const isUserSynced = (user: UserWithSettings): boolean => {
  if (!globalConfig) return true; // sem dados, assume sincronizado
  return (
    user.ai_provider === globalConfig.provider &&
    user.ai_model === globalConfig.model
  );
};
```

Na coluna "Provider IA" da tabela, adicionar abaixo do badge existente um indicador pequeno:

```tsx
<TableCell>
  <div className="flex flex-col gap-1">
    <Badge variant="secondary">
      {getProviderLabel(user.ai_provider || "openrouter")}
    </Badge>
    {!isUserSynced(user) && (
      <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
        <AlertTriangle className="h-3 w-3" />
        Customizado
      </span>
    )}
    {isUserSynced(user) && (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        Sincronizado
      </span>
    )}
  </div>
</TableCell>
```

Adicionar `CheckCircle2` ao import do `lucide-react` (linha 31).

---

### Mudança 3 — Botão "Sincronizar Todos" no cabeçalho

No cabeçalho da página (onde já existe o botão "Atualizar"), adicionar o novo botão ao lado:

```tsx
<div className="flex items-center gap-2">
  <Button
    variant="outline"
    size="sm"
    onClick={() => { fetchGlobalConfig(); setSyncAllDialogOpen(true); }}
  >
    <RefreshCw className="h-4 w-4 mr-2" />
    Sincronizar Todos
  </Button>
  <Button variant="outline" size="sm" onClick={fetchUsers}>
    <RefreshCw className="h-4 w-4 mr-2" />
    Atualizar
  </Button>
</div>
```

---

### Mudança 4 — Diálogo de confirmação do "Sincronizar Todos"

Adicionar um novo `AlertDialog` ao final do componente (antes do fechamento do `return`):

```tsx
<AlertDialog open={syncAllDialogOpen} onOpenChange={setSyncAllDialogOpen}>
  <AlertDialogContent className="max-w-md">
    <AlertDialogHeader>
      <AlertDialogTitle className="flex items-center gap-2">
        <RefreshCw className="h-5 w-5 text-primary" />
        Sincronizar Todos os Usuários
      </AlertDialogTitle>
      <AlertDialogDescription asChild>
        <div className="space-y-3">
          <p>Esta ação irá aplicar as configurações globais de IA para <strong>todos os {users.length} usuários</strong>:</p>
          <div className="bg-muted p-3 rounded-lg space-y-1 text-sm">
            <div><span className="text-muted-foreground">Provider:</span> <strong>{getProviderLabel(globalConfig?.provider || "openrouter")}</strong></div>
            <div><span className="text-muted-foreground">Modelo:</span> <strong>{globalConfig?.model || "google/gemini-3-flash-preview"}</strong></div>
          </div>
          <p className="text-sm text-muted-foreground">
            Configurações personalizadas individuais serão sobrescritas. Esta ação não pode ser desfeita automaticamente.
          </p>
        </div>
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={syncingAll}>Cancelar</AlertDialogCancel>
      <AlertDialogAction onClick={handleSyncAll} disabled={syncingAll}>
        {syncingAll ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sincronizando...</>
        ) : (
          "Confirmar Sincronização"
        )}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## Resultado visual final

```text
CABEÇALHO DA PÁGINA:
[↺ Sincronizar Todos]  [↺ Atualizar]

CABEÇALHO DO CARD:
Lista de Usuários (3)              [buscar...]

TABELA — Coluna "Provider IA":
┌─────────────────────┐
│ [OpenRouter]        │  ← provider atual do usuário
│ ✓ Sincronizado      │  ← verde se bate com o global
└─────────────────────┘

┌─────────────────────┐
│ [Google Gemini]     │  ← provider diferente do global
│ ⚠ Customizado       │  ← âmbar se for diferente
└─────────────────────┘

DIÁLOGO "Sincronizar Todos":
┌─────────────────────────────────────────────────┐
│ ↺ Sincronizar Todos os Usuários                 │
│                                                 │
│ Esta ação irá aplicar as configurações globais  │
│ de IA para todos os 3 usuários:                 │
│                                                 │
│  Provider: OpenRouter                           │
│  Modelo: google/gemini-3-flash-preview          │
│                                                 │
│ Configurações personalizadas serão sobrescritas │
│                                                 │
│         [Cancelar]  [Confirmar Sincronização]   │
└─────────────────────────────────────────────────┘
```

---

## Arquivos alterados

| Arquivo | Mudanças |
|---------|----------|
| `src/components/dev-panel/DevUsersList.tsx` | + Import `CheckCircle2` + estados `syncAllDialogOpen`, `syncingAll`, `globalConfig` + `fetchGlobalConfig` + `handleSyncAll` + `isUserSynced` + botão no cabeçalho + indicador por linha + AlertDialog de confirmação |

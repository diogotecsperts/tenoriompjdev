
# Plano de Correção: Limpeza de Prompts Obsoletos e Melhoria da UI

## Problema Central Identificado

Após análise detalhada, confirmei que existem **3 problemas inter-relacionados**:

### 1. Prompt Fantasma no Banco de Dados
- `prompt_regen_descricaoPostoTrabalho` **ainda existe no banco** apesar de ter sido removido do código
- A função `seed-prompts` apenas faz UPSERT (insere/atualiza) mas **NUNCA deleta** prompts obsoletos
- Resultado: aparece na exportação PDF e na tela de edição como "órfão"

### 2. Design "Gerar vs Regerar" Não Documentado
- Campos descritivos (história, exames, atividades) só têm **Regerar** (extração de PDF)
- Campos analíticos (nexo causal, incapacidade) têm **Gerar** (criação via IA)
- A UI não explica essa diferença, gerando confusão

### 3. Verificação de Atualizações Incompleta
- A função `check_updates` verifica prompts **do código → banco** mas não detecta prompts **órfãos no banco** que foram removidos do código

---

## Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `supabase/functions/seed-prompts/index.ts` | Adicionar lógica de limpeza de prompts obsoletos |
| `src/components/dev-panel/DevPrompts.tsx` | Melhorar UI com documentação e detecção de órfãos |

---

## Implementação Detalhada

### Parte 1: Limpeza de Prompts Obsoletos (seed-prompts)

**Nova função `cleanupObsoletePrompts`:**

```typescript
// Lista de prompts que foram REMOVIDOS do código e devem ser deletados do banco
const OBSOLETE_PROMPTS = [
  'prompt_regen_descricaoPostoTrabalho', // Unificado em descricaoAtividadesLaborais
];

async function cleanupObsoletePrompts(supabase: any) {
  let deletedCount = 0;
  
  for (const id of OBSOLETE_PROMPTS) {
    const { error } = await supabase
      .from('system_config')
      .delete()
      .eq('id', id);
    
    if (!error) {
      console.log(`[seed-prompts] Deleted obsolete prompt: ${id}`);
      deletedCount++;
    }
  }
  
  return deletedCount;
}
```

**Modificar a ação `seed` para incluir limpeza:**

```typescript
// Na ação 'seed':
// 1. Primeiro limpar prompts obsoletos
const deletedCount = await cleanupObsoletePrompts(supabase);

// 2. Depois fazer o upsert dos prompts atuais
// ... código existente ...

return new Response(
  JSON.stringify({ 
    inserted, 
    updated, 
    deleted: deletedCount,
    message: `Prompts sincronizados com sucesso` 
  }),
  { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
);
```

### Parte 2: Melhorar `check_updates` para Detectar Órfãos

**Modificar a função `checkUpdates`:**

```typescript
async function checkUpdates(supabase: any) {
  const hardcodedPrompts = getAllPromptsMap();
  const hardcodedIds = new Set(Object.keys(hardcodedPrompts));
  
  // Buscar TODOS os prompts no banco
  const { data: allDbPrompts } = await supabase
    .from('system_config')
    .select('id')
    .like('id', 'prompt_%');
  
  const results = {
    outdatedDescriptions: [],
    newPrompts: [],
    customized: [],
    upToDate: [],
    // NOVO: prompts órfãos que existem no banco mas não no código
    orphaned: [] as Array<{ id: string; description: string }>,
    totalHardcoded: hardcodedIds.size
  };
  
  // Detectar órfãos: no banco mas não no código
  for (const row of (allDbPrompts || [])) {
    if (!hardcodedIds.has(row.id)) {
      // Buscar descrição para mostrar na UI
      const { data: orphanData } = await supabase
        .from('system_config')
        .select('value')
        .eq('id', row.id)
        .single();
      
      results.orphaned.push({
        id: row.id,
        description: orphanData?.value?.description || '(sem descrição)'
      });
    }
  }
  
  // ... resto da lógica existente ...
  
  return results;
}
```

### Parte 3: Melhorar UI do DevPrompts

**Adicionar seção de prompts órfãos no Dialog de Atualizações:**

```tsx
{pendingUpdates?.orphaned && pendingUpdates.orphaned.length > 0 && (
  <div className="space-y-2">
    <div className="flex items-center gap-2 text-destructive">
      <AlertTriangle className="h-4 w-4" />
      <h4 className="font-medium">
        Prompts Órfãos ({pendingUpdates.orphaned.length})
      </h4>
    </div>
    <p className="text-sm text-muted-foreground">
      Estes prompts existem no banco mas foram removidos do código. 
      Serão deletados ao sincronizar.
    </p>
    <div className="border rounded-md p-3 bg-destructive/5 space-y-1 max-h-32 overflow-y-auto">
      {pendingUpdates.orphaned.map((p) => (
        <div key={p.id} className="text-sm flex items-center gap-2">
          <Trash2 className="h-3 w-3 text-destructive" />
          <code className="text-xs">{p.id}</code>
          <span className="text-muted-foreground">- {p.description}</span>
        </div>
      ))}
    </div>
  </div>
)}
```

**Adicionar tooltip explicativo para "Gerar" vs "Regerar":**

Na seção que mostra "Nenhum prompt de geração", adicionar:

```tsx
{genPrompts.length === 0 && (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-xs text-muted-foreground cursor-help flex items-center gap-1">
          <HelpCircle className="h-3 w-3" />
          Nenhum prompt de geração
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>
          Campos descritivos (história, exames, atividades) usam apenas 
          <strong> Regerar</strong> para extrair do PDF original.
        </p>
        <p className="mt-1">
          Prompts de <strong>Gerar</strong> são usados em campos analíticos 
          (nexo causal, incapacidade) que combinam dados de outros campos.
        </p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
)}
```

---

## Fluxo Atualizado

```text
┌─────────────────────────────────────────────────────────────────┐
│  VERIFICAR ATUALIZAÇÕES (botão)                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Dialog mostra:                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ⚠️ Prompts Órfãos (1)                                   │   │
│  │   🗑️ prompt_regen_descricaoPostoTrabalho               │   │
│  │      "Será deletado ao sincronizar"                     │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ 📋 Labels Desatualizados (X)                            │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ ✨ Novos Prompts (Y)                                    │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ 🎨 Personalizados (Z) - serão preservados               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [Sincronizar Labels]  [Restaurar Padrão de Fábrica]           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Garantias de Segurança

1. **Limpeza controlada** - Apenas IDs explicitamente listados em `OBSOLETE_PROMPTS` são deletados
2. **Visibilidade** - Órfãos são mostrados antes de qualquer ação destrutiva
3. **Sem impacto funcional** - O campo `descricaoPostoTrabalho` já não é usado nas Edge Functions
4. **Fallbacks intactos** - A arquitetura de fallback continua funcionando

---

## Ordem de Execução

1. Atualizar `seed-prompts/index.ts` com:
   - Lista de prompts obsoletos
   - Função de limpeza
   - Detecção de órfãos em `check_updates`

2. Atualizar `DevPrompts.tsx` com:
   - Exibição de prompts órfãos no dialog
   - Tooltip explicativo para "Gerar vs Regerar"
   - Atualização do tipo `UpdatesResult`

3. Deploy e teste

---

## Resultado Esperado

Após implementação:
- `prompt_regen_descricaoPostoTrabalho` será deletado do banco
- Exportação PDF só mostrará prompts válidos
- UI explicará claramente a diferença entre Gerar e Regerar
- Futuros prompts removidos serão automaticamente detectados e limpos

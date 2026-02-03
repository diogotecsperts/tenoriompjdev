

# Plano de Sincronização Inteligente de Prompts

## Resumo Executivo

Este plano implementa três melhorias no sistema de gerenciamento de prompts:
1. **Sincronização Inteligente** - Atualiza metadados sem sobrescrever conteúdo customizado
2. **Botão "Verificar Atualizações"** - Mostra prompts desatualizados antes de sincronizar
3. **Renomear botão** - "Restaurar Padrão de Fábrica" para clareza

---

## Análise de Integridade do Sistema Atual

Após análise detalhada dos arquivos, confirmo que **o sistema está corretamente sincronizado**:

### Fluxo de Dados Atual

```text
┌─────────────────────────────────────────────────────────────────┐
│                    FONTES DE VERDADE                            │
├─────────────────────────────────────────────────────────────────┤
│  1. LAUDO_STRUCTURE (src/lib/laudo-structure.ts)                │
│     → Define estrutura hierárquica de cards/seções              │
│     → Usado por: LaudoEditor, DevPrompts                        │
│                                                                 │
│  2. seed-prompts/index.ts (hardcoded)                          │
│     → Define prompts padrão com cardId/sectionId               │
│     → Usado por: botão "Carregar Padrão"                       │
│                                                                 │
│  3. system_config (banco de dados)                             │
│     → Armazena prompts customizáveis                           │
│     → Usado por: Edge Functions via prompt-manager              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO DE EXECUÇÃO                            │
├─────────────────────────────────────────────────────────────────┤
│  Edge Function → prompt-manager.getPrompt()                    │
│       ↓                                                         │
│  1. Busca no banco (system_config)                             │
│       ↓                                                         │
│  2. Se encontrou → usa prompt do banco                         │
│  3. Se não encontrou → usa fallback hardcoded                   │
│       ↓                                                         │
│  4. Auto-registra prompt no banco (se não existir)             │
└─────────────────────────────────────────────────────────────────┘
```

### Confirmação de Integridade

| Componente | Status | Observação |
|------------|--------|------------|
| regerar-campo-pdf | OK | Usa prompt-manager com fallbacks |
| gerar-resumos | OK | Usa prompt-manager com fallbacks |
| processar-autos | OK | Usa prompt-manager com fallbacks |
| prompt-manager | OK | Cache TTL 5min + auto-registro |
| DevPrompts | OK | Sincronizado com LAUDO_STRUCTURE |
| seed-prompts | OK | Prompts padronizados corretamente |
| LAUDO_STRUCTURE | OK | Fonte única de verdade para navegação |

**Conclusão: O sistema funciona corretamente mesmo sem clicar em "Carregar Padrão"** graças aos fallbacks. O botão é útil apenas para:
- Resetar prompts customizados para o padrão
- Sincronizar labels/descrições após atualizações de código

---

## Proposta de Implementação

### 1. Sincronização Inteligente de Metadados

**Conceito**: Atualizar APENAS os metadados (description, cardId, sectionId) sem tocar no conteúdo do prompt.

**Arquivo a modificar**: `supabase/functions/seed-prompts/index.ts`

**Nova função**:
```typescript
// Modo "sync_metadata" - atualiza apenas metadados, preserva prompt customizado
async function syncMetadataOnly(supabase, prompts) {
  for (const [id, config] of Object.entries(prompts)) {
    const { data: existing } = await supabase
      .from('system_config')
      .select('value')
      .eq('id', id)
      .single();
    
    if (existing) {
      // Preserva o prompt existente, atualiza apenas metadados
      const updatedConfig = {
        ...existing.value,
        description: config.description,
        cardId: config.cardId,
        sectionId: config.sectionId,
        // NÃO sobrescreve: prompt, variables
      };
      await supabase.from('system_config').update({ value: updatedConfig }).eq('id', id);
    }
  }
}
```

### 2. Endpoint para Verificar Atualizações

**Arquivo a modificar**: `supabase/functions/seed-prompts/index.ts`

**Nova ação**: `check_updates`

```typescript
// Compara prompts do banco com hardcoded
async function checkUpdates(supabase, prompts) {
  const results = {
    outdatedDescriptions: [],  // Labels desatualizados
    newPrompts: [],            // Prompts novos não no banco
    customized: [],            // Prompts com conteúdo diferente do padrão
    upToDate: []               // Prompts sem alterações
  };
  
  for (const [id, config] of Object.entries(prompts)) {
    const { data: existing } = await supabase
      .from('system_config')
      .select('value')
      .eq('id', id)
      .single();
    
    if (!existing) {
      results.newPrompts.push({ id, description: config.description });
    } else {
      const dbConfig = existing.value;
      
      // Verifica se descrição/metadados mudaram
      if (dbConfig.description !== config.description) {
        results.outdatedDescriptions.push({
          id,
          current: dbConfig.description,
          new: config.description
        });
      }
      
      // Verifica se prompt foi customizado
      if (dbConfig.prompt !== config.prompt) {
        results.customized.push({
          id,
          description: config.description
        });
      } else {
        results.upToDate.push({ id });
      }
    }
  }
  
  return results;
}
```

### 3. UI para Verificar Atualizações

**Arquivo a modificar**: `src/components/dev-panel/DevPrompts.tsx`

**Novo componente**: Dialog mostrando atualizações disponíveis

```typescript
// Estado para controlar dialog
const [showUpdatesDialog, setShowUpdatesDialog] = useState(false);
const [pendingUpdates, setPendingUpdates] = useState<UpdatesResult | null>(null);
const [checkingUpdates, setCheckingUpdates] = useState(false);

// Função para verificar
const checkForUpdates = async () => {
  setCheckingUpdates(true);
  const { data } = await supabase.functions.invoke('seed-prompts', {
    body: { action: 'check_updates' }
  });
  setPendingUpdates(data);
  setShowUpdatesDialog(true);
  setCheckingUpdates(false);
};

// Dialog UI
<Dialog open={showUpdatesDialog}>
  <DialogTitle>Atualizações Disponíveis</DialogTitle>
  <DialogContent>
    {pendingUpdates?.outdatedDescriptions.length > 0 && (
      <section>
        <h4>Labels Desatualizados ({count})</h4>
        <p>Descrições que mudaram no código mas não foram sincronizadas:</p>
        <ul>
          {pendingUpdates.outdatedDescriptions.map(p => (
            <li key={p.id}>
              <strong>{p.id}</strong>
              <span className="text-muted">Atual: {p.current}</span>
              <span className="text-green">Novo: {p.new}</span>
            </li>
          ))}
        </ul>
      </section>
    )}
    
    {pendingUpdates?.customized.length > 0 && (
      <section>
        <h4>Prompts Customizados ({count})</h4>
        <p>Estes prompts foram editados e serão preservados:</p>
        <ul>...</ul>
      </section>
    )}
    
    {pendingUpdates?.newPrompts.length > 0 && (
      <section>
        <h4>Novos Prompts ({count})</h4>
        <p>Prompts adicionados ao código que não existem no banco:</p>
        <ul>...</ul>
      </section>
    )}
  </DialogContent>
  <DialogFooter>
    <Button onClick={syncMetadataOnly}>
      Sincronizar Apenas Labels
    </Button>
    <Button onClick={() => setShowSeedConfirmDialog(true)} variant="destructive">
      Restaurar Tudo ao Padrão
    </Button>
  </DialogFooter>
</Dialog>
```

### 4. Renomear Botão

**Arquivo a modificar**: `src/components/dev-panel/DevPrompts.tsx`

**Antes**:
```tsx
<Button onClick={() => setShowSeedConfirmDialog(true)}>
  <Database className="h-4 w-4 mr-2" />
  Carregar Padrão
</Button>
```

**Depois**:
```tsx
<div className="flex gap-2">
  <Button onClick={checkForUpdates} variant="outline">
    <RefreshCw className="h-4 w-4 mr-2" />
    Verificar Atualizações
  </Button>
  <Button onClick={() => setShowSeedConfirmDialog(true)} variant="destructive">
    <Database className="h-4 w-4 mr-2" />
    Restaurar Padrão de Fábrica
  </Button>
</div>
```

**Dialog de confirmação atualizado**:
```tsx
<AlertDialogDescription>
  ATENÇÃO: Esta ação irá SOBRESCREVER todos os prompts personalizados 
  com as versões padrão de fábrica.
  
  Todos os ajustes que você fez nos textos dos prompts serão PERDIDOS.
  
  Recomendamos exportar um backup PDF antes de continuar.
</AlertDialogDescription>
```

---

## Estrutura de Ações na UI

```text
┌─────────────────────────────────────────────────────────────────┐
│  PÁGINA PROMPTS IA                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────┐  ┌──────────────────────────────┐    │
│  │ Verificar Atualizações│  │ Restaurar Padrão de Fábrica │    │
│  └──────────────────────┘  └──────────────────────────────┘    │
│           │                              │                      │
│           ▼                              ▼                      │
│  ┌─────────────────────┐     ┌────────────────────────────┐    │
│  │ Dialog: Atualizações │     │ Dialog: Confirmação        │    │
│  │ - Labels outdated    │     │                            │    │
│  │ - Novos prompts      │     │ "Você tem certeza?"        │    │
│  │ - Prompts customized │     │ "Isso vai APAGAR tudo"     │    │
│  │                       │     │                            │    │
│  │ [Sincronizar Labels] │     │ [Cancelar] [Restaurar]     │    │
│  │ [Restaurar Tudo]     │     └────────────────────────────┘    │
│  └─────────────────────┘                                        │
│                                                                 │
│  ┌──────────────────────┐                                      │
│  │   Exportar PDF       │  ← Backup antes de qualquer ação     │
│  └──────────────────────┘                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Tipo | Modificação |
|---------|------|-------------|
| `supabase/functions/seed-prompts/index.ts` | Modificar | Adicionar ações `check_updates` e `sync_metadata` |
| `src/components/dev-panel/DevPrompts.tsx` | Modificar | Novo botão "Verificar Atualizações", renomear "Carregar Padrão", dialog de atualizações |

---

## Garantias de Segurança

1. **Zero impacto nas Edge Functions** - A lógica de busca de prompts não muda
2. **Fallbacks continuam funcionando** - prompt-manager usa hardcoded se banco falhar
3. **Customizações preservadas** - "Sincronizar Labels" não toca no conteúdo
4. **Backup disponível** - Botão "Exportar PDF" antes de qualquer operação destrutiva
5. **Confirmação explícita** - Dialog obrigatório para restauração completa

---

## Fluxo Recomendado para o Usuário

```text
1. Desenvolvedor faz alterações no código (seed-prompts)
2. Deploy automático da Edge Function
3. Usuário abre DevPanel > Prompts IA
4. Clica em "Verificar Atualizações"
5. Vê lista de labels desatualizados
6. Clica em "Sincronizar Labels" (preserva customizações)
7. OU clica em "Restaurar Padrão de Fábrica" (reset completo)
```

---

## Resposta às Suas Perguntas

**Está tudo sincronizado com criação de laudos, importação via IA, OCR?**

Sim! Após análise completa, confirmo:

1. **regerar-campo-pdf**: Usa `getPrompt()` com fallbacks hardcoded idênticos aos do seed
2. **gerar-resumos**: Usa `getPrompt()` com fallbacks locais
3. **processar-autos**: Usa `getPrompt()` para o system prompt
4. **prompt-manager**: Sempre retorna um prompt válido (banco ou fallback)

**A comunicação NÃO se perdeu.** O sistema foi projetado com redundância:
- Se o banco tem o prompt → usa o banco
- Se o banco não tem → usa fallback do código
- Se o banco falha → usa fallback do código

O "Carregar Padrão" nunca foi obrigatório para funcionamento. É apenas uma ferramenta de manutenção para sincronizar a UI ou resetar customizações.


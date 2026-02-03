
# Correção Definitiva: Deleção Automática de Prompts Órfãos

## Problema Identificado

O sistema de "Restaurar Tudo" não está deletando os prompts órfãos (`prompt_gen_descricao_cid` e `prompt_system_gerar_resumos`) porque:

| Componente | Comportamento Atual | Problema |
|------------|---------------------|----------|
| `OBSOLETE_PROMPTS` | Lista manual estática | Contém apenas 1 ID antigo |
| `cleanupObsoletePrompts` | Deleta apenas IDs da lista manual | Não detecta órfãos automaticamente |
| `checkUpdates` | Detecta órfãos corretamente | Apenas exibe, não deleta |

A UI mostra "2 Órfãos" corretamente (detecção automática funciona), mas ao clicar em "Restaurar Tudo", a função de cleanup só deleta IDs listados **manualmente** em `OBSOLETE_PROMPTS`.

---

## Solução

Modificar a função `cleanupObsoletePrompts` para **deletar automaticamente** todos os prompts que existem no banco mas não existem no código-fonte (órfãos detectados dinamicamente).

---

## Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `supabase/functions/seed-prompts/index.ts` | Refatorar `cleanupObsoletePrompts` para detecção automática |

---

## Implementação Técnica

A função `cleanupObsoletePrompts` será reescrita para:

1. Buscar todos os prompts do banco com prefixo `prompt_%`
2. Comparar com os IDs definidos em `getAllPromptsMap()`
3. Deletar todos que **existem no banco mas não existem no código**

```text
┌─────────────────────────────────────────────────────────────┐
│                   cleanupObsoletePrompts                    │
├─────────────────────────────────────────────────────────────┤
│  1. Buscar todos os IDs do banco (prompt_%)                 │
│  2. Obter todos os IDs do código (getAllPromptsMap)         │
│  3. Calcular diferença: banco - código = órfãos             │
│  4. DELETE cada órfão encontrado                            │
│  5. Retornar quantidade deletada                            │
└─────────────────────────────────────────────────────────────┘
```

### Código Proposto

```typescript
async function cleanupObsoletePrompts(supabase: any) {
  const hardcodedPrompts = getAllPromptsMap();
  const hardcodedIds = new Set(Object.keys(hardcodedPrompts));
  
  // Buscar todos os prompts do banco
  const { data: allDbPrompts } = await supabase
    .from('system_config')
    .select('id')
    .like('id', 'prompt_%');
  
  let deletedCount = 0;
  
  // Deletar prompts que existem no banco mas não no código
  for (const row of (allDbPrompts || [])) {
    if (!hardcodedIds.has(row.id)) {
      const { error } = await supabase
        .from('system_config')
        .delete()
        .eq('id', row.id);
      
      if (!error) {
        console.log(`[seed-prompts] Deleted orphan prompt: ${row.id}`);
        deletedCount++;
      } else {
        console.error(`[seed-prompts] Failed to delete ${row.id}:`, error);
      }
    }
  }
  
  // Manter também a lista manual para garantir retrocompatibilidade
  for (const id of OBSOLETE_PROMPTS) {
    const { error } = await supabase
      .from('system_config')
      .delete()
      .eq('id', id);
    
    if (!error) {
      deletedCount++;
    }
  }
  
  return deletedCount;
}
```

---

## Resultado Esperado

Após a implementação:

1. Clicar em "Restaurar Padrão de Fábrica"
2. O sistema detecta automaticamente todos os prompts órfãos
3. `prompt_gen_descricao_cid` é deletado
4. `prompt_system_gerar_resumos` é deletado
5. O contador mostra "0 Órfãos"
6. Novos prompts órfãos futuros serão detectados e removidos automaticamente

---

## Benefício de Longo Prazo

Nunca mais será necessário editar manualmente a lista `OBSOLETE_PROMPTS`. Qualquer prompt removido do código será automaticamente detectado e deletado ao restaurar os padrões de fábrica.

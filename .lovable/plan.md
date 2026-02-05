
# Corrigir Texto Fixo da Metodologia Pericial

## Problema Identificado

O campo "Metodologia Pericial" não está recebendo o texto fixo configurado no banco de dados (`config_metodologia_padrao`) ao importar um PDF. Em vez disso, usa um texto antigo hardcoded.

## Causa Raiz

Existem **3 fontes de texto desatualizado** que precisam ser sincronizadas com o banco:

| Local | Problema |
|-------|----------|
| `ImportarAutosDialog.tsx` | Não inclui `metodologia_pericial` no `laudoData` |
| `LaudoContext.tsx` (linha 345) | Texto hardcoded antigo no `createEmptyLaudo()` |
| Coluna `metodologia_pericial` na tabela `laudos` | DEFAULT desatualizado |

## Solução

### Etapa 1: Atualizar ImportarAutosDialog.tsx

Buscar o texto padrão do `system_config` antes de criar o laudo e incluí-lo no objeto `laudoData`:

```tsx
// Dentro de createLaudo(), antes de construir laudoData
const { data: metodologiaConfig } = await supabase
  .from('system_config')
  .select('value')
  .eq('id', 'config_metodologia_padrao')
  .single();

const metodologiaPadrao = metodologiaConfig?.value?.texto || '';

// Adicionar ao laudoData:
metodologia_pericial: metodologiaPadrao,
```

### Etapa 2: Atualizar LaudoContext.tsx

Na função `createEmptyLaudo()`, remover o texto hardcoded e buscar do banco de dados:

```tsx
metodologiaPericial: '', // Será preenchido pelo DEFAULT do banco ou manualmente
```

### Etapa 3: Migração SQL

Atualizar o DEFAULT da coluna `metodologia_pericial` na tabela `laudos` para usar o texto correto do `system_config`:

```sql
ALTER TABLE laudos 
ALTER COLUMN metodologia_pericial 
SET DEFAULT '';
```

O campo ficará vazio por padrão e será preenchido explicitamente pelo código ao buscar do `config_metodologia_padrao`.

### Etapa 4 (Opcional): Atualizar Laudos Existentes

Para corrigir laudos já criados com o texto antigo:

```sql
UPDATE laudos 
SET metodologia_pericial = (
  SELECT value->>'texto' 
  FROM system_config 
  WHERE id = 'config_metodologia_padrao'
)
WHERE metodologia_pericial = 'Este laudo foi elaborado com base no estudo das peças...';
```

---

## Detalhes Técnicos

### Arquivo: `src/components/tools/ImportarAutosDialog.tsx`

Modificar função `createLaudo()` (linha ~942):

1. Adicionar busca do texto padrão antes de criar o objeto `laudoData`
2. Incluir `metodologia_pericial: metodologiaPadrao` no objeto

### Arquivo: `src/contexts/LaudoContext.tsx`

Modificar função `createEmptyLaudo()` (linha ~345):

1. Alterar `metodologiaPericial` de texto hardcoded para string vazia
2. Na função `createLaudo()`, buscar o texto padrão do banco antes de inserir

### Migração SQL

Alterar o DEFAULT da coluna para evitar que novos laudos recebam texto antigo automaticamente.

---

## Resultado Esperado

Após a implementação:
- Novos laudos criados via importação receberão o texto correto do `config_metodologia_padrao`
- Novos laudos criados manualmente também usarão o texto do banco
- O botão "Restaurar padrão" continuará funcionando corretamente
- Alterações futuras no `config_metodologia_padrao` serão refletidas em novos laudos automaticamente


# Plano de Correção das Pendências - Fase Final

## Sumário Executivo

Este plano corrige todas as pendências identificadas na implementação anterior, garantindo 100% de conformidade com o plano original aprovado.

---

## PENDÊNCIAS IDENTIFICADAS E CORREÇÕES

### 1. Remover Referências ao Campo `descricaoPostoTrabalho`

O campo foi visualmente removido do componente `DadosPostoTrabalho.tsx`, mas ainda existe em vários outros arquivos do sistema.

#### 1.1 Arquivos que Precisam de Correção

| Arquivo | Linha | Problema | Solução |
|---------|-------|----------|---------|
| `src/contexts/LaudoContext.tsx` | 85, 204, 322, 424, 525, 624, 714 | Campo ainda existe na interface e mapeamento | Manter campo na interface (compatibilidade com banco), mas ignorar/não usar |
| `src/hooks/useLaudoProgress.ts` | 42 | Campo conta para progresso | REMOVER da lista de campos do card "posto-trabalho" |
| `src/pages/LaudoEditor.tsx` | 436 | Passa campo para contexto de IA | Substituir por `descricaoAtividadesLaborais` |
| `src/components/laudo/sections/ReferenciasBibliograficas.tsx` | 25 | Usa campo para contexto de IA | Substituir por `descricaoAtividadesLaborais` |
| `supabase/functions/regerar-campo-pdf/index.ts` | 24 | Prompt de regeneração para campo antigo | REMOVER entrada do mapeamento |
| `src/components/tools/ImportarAutosDialog.tsx` | 996 | Mapeia dados extraídos para campo antigo | Unificar dados em `descricao_atividades_laborais` |

#### 1.2 Decisão Técnica Importante

**O campo `descricaoPostoTrabalho` NÃO será removido do LaudoContext ou banco de dados** porque:
1. Laudos antigos podem ter dados nesse campo
2. Migração de esquema de banco é complexa e arriscada

**Estratégia: Migração em Tempo de Execução**
- Ao carregar um laudo, concatenar `descricaoPostoTrabalho` + `descricaoAtividadesLaborais` em um único campo
- Ao salvar, gravar tudo apenas em `descricaoAtividadesLaborais`
- Limpar `descricaoPostoTrabalho` após migração

---

### 2. Atualizar Prompt de Extração do PDF

#### Arquivo: `supabase/functions/processar-autos/index.ts`

**Mudança no Schema JSON:**

Atual:
```json
"posto_trabalho": {
  "descricao_ambiente": "",
  "descricao_atividades": ""
}
```

Novo:
```json
"posto_trabalho": {
  "ambiente_e_atividades": ""
}
```

**Mudança nas Instruções:**

Seção 10.4 e 10.5 devem ser UNIFICADAS:

```
10.4. ambiente_e_atividades - CAMPO UNIFICADO - DETALHAR AO MÁXIMO:

AMBIENTE DE TRABALHO:
- Ambiente físico (interno/externo, coberto/descoberto, climatizado)
- Dimensões aproximadas do local
- Equipamentos e máquinas utilizados
- Mobiliário (mesa, cadeira, bancada)
- Condições ergonômicas do posto
- Exposição a riscos físicos (ruído, vibração, temperatura)
- Exposição a riscos químicos e biológicos
- Condições de iluminação e ventilação
- EPIs fornecidos e utilizados

ATIVIDADES LABORAIS:
- Descrição completa das tarefas diárias
- Movimentos repetitivos (quais, frequência, duração)
- Esforço físico exigido (peso carregado, frequência)
- Posturas predominantes (tempo em cada postura)
- Jornada de trabalho e horas extras
- Pausas durante o trabalho
- Ritmo de trabalho e metas
- Ferramentas manuais utilizadas

MÍNIMO 3 parágrafos. Busque em PPP, PPRA, PCMSO, laudos ergonômicos, depoimentos.
```

---

### 3. Atualizar Mapeamento no ImportarAutosDialog

#### Arquivo: `src/components/tools/ImportarAutosDialog.tsx`

**Mudança na Linha ~996:**

De:
```typescript
descricao_posto_trabalho: extractedData.posto_trabalho?.descricao_ambiente || '',
descricao_atividades_laborais: extractedData.posto_trabalho?.descricao_atividades || '',
```

Para:
```typescript
descricao_posto_trabalho: '', // Campo legado - não mais usado
descricao_atividades_laborais: 
  (extractedData.posto_trabalho?.ambiente_e_atividades || '') ||
  [extractedData.posto_trabalho?.descricao_ambiente, extractedData.posto_trabalho?.descricao_atividades]
    .filter(Boolean).join('\n\n'),
```

**Compatibilidade retroativa:** Se o PDF foi processado com o prompt antigo (campos separados), concatenar ambos.

---

### 4. Adicionar Lógica de Migração de Dados Legados

#### Arquivo: `src/contexts/LaudoContext.tsx`

**Adicionar função de migração:**

```typescript
const migrateLegacyFields = (laudo: LaudoData): LaudoData => {
  // Migrar descricaoPostoTrabalho para descricaoAtividadesLaborais
  if (laudo.descricaoPostoTrabalho && laudo.descricaoPostoTrabalho.trim()) {
    const existing = laudo.descricaoAtividadesLaborais?.trim() || '';
    const legacy = laudo.descricaoPostoTrabalho.trim();
    
    // Concatenar se atividades também tem conteúdo
    if (existing && !existing.includes(legacy)) {
      laudo.descricaoAtividadesLaborais = `${legacy}\n\n${existing}`;
    } else if (!existing) {
      laudo.descricaoAtividadesLaborais = legacy;
    }
    
    // Limpar campo legado
    laudo.descricaoPostoTrabalho = '';
  }
  
  return laudo;
};
```

**Aplicar em `loadLaudo` e `refreshLaudos`:**
Após mapear os dados do banco, chamar `migrateLegacyFields()`.

---

### 5. Remover Campo do useLaudoProgress

#### Arquivo: `src/hooks/useLaudoProgress.ts`

**Linha 38-44 - Antes:**
```typescript
"posto-trabalho": [
  "dadosFuncionaisCargo",
  "dadosFuncionaisAdmissao",
  "dadosFuncionaisAfastamento",
  "descricaoPostoTrabalho",
  "descricaoAtividadesLaborais",
],
```

**Depois:**
```typescript
"posto-trabalho": [
  "dadosFuncionaisCargo",
  "dadosFuncionaisAdmissao",
  "dadosFuncionaisAfastamento",
  "descricaoAtividadesLaborais",
],
```

---

### 6. Atualizar Referências em LaudoEditor e ReferenciasBibliograficas

#### Arquivo: `src/pages/LaudoEditor.tsx` (linha ~436)

**Antes:**
```typescript
contexto: {
  postoTrabalho: currentLaudo.descricaoPostoTrabalho,
  atividadesLaborais: currentLaudo.descricaoAtividadesLaborais,
```

**Depois:**
```typescript
contexto: {
  postoTrabalho: currentLaudo.descricaoAtividadesLaborais, // Campo unificado
  atividadesLaborais: currentLaudo.descricaoAtividadesLaborais,
```

#### Arquivo: `src/components/laudo/sections/ReferenciasBibliograficas.tsx` (linha ~25)

**Antes:**
```typescript
postoTrabalho: currentLaudo.descricaoPostoTrabalho || '',
```

**Depois:**
```typescript
postoTrabalho: currentLaudo.descricaoAtividadesLaborais || '',
```

---

### 7. Remover Prompt de Regeneração do Campo Legado

#### Arquivo: `supabase/functions/regerar-campo-pdf/index.ts`

**Remover linha 24:**
```typescript
descricaoPostoTrabalho: { promptId: 'prompt_regen_descricaoPostoTrabalho', ... },
```

---

## RESUMO DAS ALTERAÇÕES

| Arquivo | Tipo de Mudança |
|---------|-----------------|
| `src/contexts/LaudoContext.tsx` | Adicionar função `migrateLegacyFields()` |
| `src/hooks/useLaudoProgress.ts` | Remover `descricaoPostoTrabalho` do array |
| `src/pages/LaudoEditor.tsx` | Substituir referência por `descricaoAtividadesLaborais` |
| `src/components/laudo/sections/ReferenciasBibliograficas.tsx` | Substituir referência |
| `src/components/tools/ImportarAutosDialog.tsx` | Unificar mapeamento de dados |
| `supabase/functions/processar-autos/index.ts` | Unificar prompt de extração |
| `supabase/functions/regerar-campo-pdf/index.ts` | Remover entrada do campo legado |

---

## GARANTIAS DE QUALIDADE

Após esta implementação:

1. **100% do plano original será implementado**
2. **Dados legados serão migrados automaticamente** ao carregar laudos antigos
3. **Novos laudos usarão apenas o campo unificado**
4. **Nenhuma quebra de compatibilidade** com laudos existentes
5. **Prompts atualizados para extração consolidada**
6. **Progresso do laudo calculado corretamente** (sem campo fantasma)

---

## APLICAÇÃO GLOBAL

Todas as mudanças serão aplicadas:
- ✅ No código fonte (frontend React)
- ✅ Nas Edge Functions (backend Supabase)
- ✅ Na lógica de importação de PDFs
- ✅ Na lógica de regeneração de campos
- ✅ No cálculo de progresso do laudo
- ✅ Na geração de sugestões de IA

**Resultado:** Sistema consistente e limpo para todos os usuários existentes e novos.

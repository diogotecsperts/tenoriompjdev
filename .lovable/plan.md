
# Plano de Correção: Página de Prompts IA

## Problema Identificado
A página "Prompts IA" mostra **0 prompts** em todas as seções porque:
1. A tabela `system_config` está **vazia** para registros com prefixo `prompt_`
2. O sistema de **auto-registro só funciona quando uma edge function é executada** (ex: importar PDF ou regenerar campo)
3. Não existe funcionalidade para **criar prompts manualmente** ou **popular dados iniciais**

## Solução Proposta

### 1. Adicionar botão "Carregar Prompts Padrão" (Seed)
Criar um botão na página DevPrompts que popula o banco com todos os prompts hardcoded definidos no código. Isso permitirá visualizar e editar imediatamente.

**Arquivo:** `src/components/dev-panel/DevPrompts.tsx`

**Mudanças:**
- Adicionar botão "Carregar Prompts Padrão" no header
- Implementar função que insere todos os prompts padrão no `system_config`
- Os prompts serão inseridos com seus `cardId` e `sectionId` já classificados

### 2. Criar Edge Function para Seed de Prompts
Para evitar expor prompts detalhados no frontend, criar uma edge function que faz o seed inicial.

**Arquivo:** `supabase/functions/seed-prompts/index.ts`

**Funcionalidade:**
- Ler todos os prompts padrão definidos nas edge functions
- Inserir no `system_config` com metadados de classificação
- Usar `upsert` para não duplicar se já existir

### 3. Melhorar UX do Editor de Prompts
Atualmente o único indicador de que um prompt é editável é o hover. Adicionar:
- Ícone de edição mais visível no card do prompt
- Tooltip explicando que "Clique para editar"
- Estado vazio mais explicativo com CTA para carregar prompts

## Detalhamento Técnico

### Edge Function: seed-prompts

```text
POST /seed-prompts
- Apenas desenvolvedores podem chamar (verificar via is_developer())
- Lista todos os prompts padrão das funções:
  - regerar-campo-pdf: 21 prompts
  - gerar-resumos: ~9 prompts
  - processar-autos: 1 mega-prompt
- Insere cada um no system_config com:
  - id: prompt_{categoria}_{campo}
  - value: { prompt, description, cardId, sectionId, variables, isClassified: true }
- Retorna contagem de prompts inseridos/atualizados
```

### DevPrompts.tsx - Mudanças

```text
1. Novo botão no header:
   [Carregar Prompts Padrão] 
   - Chama edge function seed-prompts
   - Mostra loading durante execução
   - Atualiza lista após sucesso

2. Estado vazio melhorado:
   - Se prompts.length === 0, mostrar card explicativo
   - CTA: "Clique em 'Carregar Prompts Padrão' para começar"

3. Indicadores visuais:
   - Ícone Edit3 sempre visível no PromptCard
   - Tooltip: "Clique para editar este prompt"
```

### Lista de Prompts a Serem Carregados

| Categoria | Quantidade | Origem |
|-----------|------------|--------|
| prompt_regen_* | 21 | regerar-campo-pdf |
| prompt_gen_* | 9 | gerar-resumos |
| prompt_import_* | 1 | processar-autos |
| prompt_system_* | 2 | gerar-resumos, processar-autos |
| **Total** | **~33** | |

## Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/seed-prompts/index.ts` | **Criar** |
| `src/components/dev-panel/DevPrompts.tsx` | **Modificar** - Adicionar botão seed e melhorar UX |
| `src/components/dev-panel/PromptEditor.tsx` | **Modificar** - Melhorar indicadores visuais |

## Resultado Esperado
Após clicar em "Carregar Prompts Padrão":
- Todos os 33+ prompts aparecem organizados por card/seção
- Cada prompt é clicável para edição
- Prompts aparecem na mesma ordem do LaudoEditor
- Alterações são salvas globalmente para todos os usuários

## Validação
1. Acessar DevPanel > Prompts IA
2. Clicar em "Carregar Prompts Padrão"
3. Verificar que todas as seções agora mostram prompts
4. Clicar em um prompt e verificar que o editor abre
5. Editar um prompt e salvar
6. Verificar no banco que o prompt foi atualizado


# Plano: Sistema de Alertas e Documentacao para Gerenciamento de Prompts

## Objetivo
Implementar tres funcionalidades que garantem integridade e facilitam a manutencao do sistema de prompts quando houver mudancas estruturais no laudo.

---

## Funcionalidade 1: Alerta Visual de Secoes Sem Prompts

### O que sera feito
Adicionar um banner de alerta no topo do DevPrompts que detecta automaticamente secoes da `LAUDO_STRUCTURE` que nao possuem nenhum prompt associado (nem Importar, nem Gerar, nem Regerar).

### Comportamento
- O sistema ira comparar as 21 secoes do `LAUDO_CARDS_STRUCTURE` com os prompts carregados do banco
- Secoes com 0 prompts em todas as categorias serao listadas como "descobertas"
- O alerta sera um card amarelo/warning com icone de atencao
- Clicavel para expandir e ver detalhes

### Excecoes esperadas (nao serao alertas)
- Secoes de `PROMPT_ONLY_CARDS` (Sistema, Globais, Impugnacao) - sao categorias especiais
- Secoes que por design nao tem prompts automaticos (ex: `perito` que e preenchido manualmente)

### Localizacao na UI
- Sera exibido logo abaixo dos cards de estatisticas (Total/Classificados/Nao Classificados)
- Aparece apenas quando houver secoes descobertas

---

## Funcionalidade 2: Checklist Automatico por Tipo de Prompt

### O que sera feito
Criar um componente `CoverageChecklist` que mostra, para cada secao do laudo, um checklist visual do status de cobertura por tipo de prompt.

### Estrutura do checklist
Para cada secao exibira:
```
Secao: Dados do Acidente
  [ ] Importar: 0 prompts
  [x] Gerar: 0 prompts  
  [x] Regerar: 2 prompts (Historico Ocupacional, Historia do Acidente)
```

### Indicadores visuais
- Verde (check): tem pelo menos 1 prompt do tipo
- Vermelho (x): nao tem nenhum prompt do tipo
- Cinza (traço): tipo nao aplicavel para esta secao

### Logica de "tipo aplicavel"
- **Importar**: aplicavel a secoes que recebem dados do PDF (vitima, acidente, anamnese, antecedentes, posto, laudos, exames, etc.)
- **Gerar**: aplicavel a secoes analiticas (nexo, incapacidade, conclusao, referencias)
- **Regerar**: aplicavel a secoes com campos de texto que tem botao de refresh no editor

### Localizacao na UI
- Sera um novo painel colapsavel na sidebar de navegacao (abaixo da navegacao atual)
- Ou como uma nova aba "Cobertura" ao lado de "Classificados" e "Nao Classificados"

### Implementacao tecnica
Criar um mapeamento estatico que define quais tipos de prompt sao esperados para cada secao:
```typescript
const EXPECTED_PROMPT_TYPES: Record<string, ('import' | 'gen' | 'regen')[]> = {
  'processo': ['import'],
  'vitima': ['import'],
  'acidente': ['import', 'regen'],
  'anamnese': ['import', 'regen'],
  'nexo': ['import', 'gen'],
  'conclusao': ['regen'],
  // ...
}
```

---

## Funcionalidade 3: Documentacao Inline no laudo-structure.ts

### O que sera feito
Expandir a documentacao existente no `laudo-structure.ts` com um guia passo-a-passo completo para adicionar novos campos.

### Conteudo da documentacao

```typescript
/**
 * =========================================
 * GUIA: COMO ADICIONAR UM NOVO CAMPO/SECAO
 * =========================================
 * 
 * PASSO 1: ADICIONAR A SECAO NESTA ESTRUTURA
 * -------------------------------------------
 * Localize o card apropriado em LAUDO_CARDS_STRUCTURE e adicione:
 *   { id: "novo-campo", label: "Nome do Novo Campo" }
 * 
 * Convencoes de ID:
 * - Use kebab-case para IDs compostos (ex: "exame-fisico")
 * - Use nomes curtos e descritivos
 * - O ID sera usado como referencia em todo o sistema
 * 
 * 
 * PASSO 2: CRIAR O COMPONENTE DE FORMULARIO
 * -------------------------------------------
 * Arquivo: src/components/laudo/sections/NovoCampo.tsx
 * 
 * Template basico:
 *   export function NovoCampo() {
 *     const { laudo, updateLaudo, isLoading } = useLaudo();
 *     return (
 *       <LaudoTextareaAIField
 *         label="Nome do Campo"
 *         fieldName="nome_campo_banco"
 *         promptKey="novoCampo"
 *       />
 *     );
 *   }
 * 
 * 
 * PASSO 3: REGISTRAR O COMPONENTE NO LAUDOEDITOR
 * -----------------------------------------------
 * Arquivo: src/pages/LaudoEditor.tsx
 * 
 * a) Importar o componente:
 *    import { NovoCampo } from "@/components/laudo/sections/NovoCampo";
 * 
 * b) Adicionar ao renderSection():
 *    case "novo-campo": return <NovoCampo />;
 * 
 * 
 * PASSO 4: ADICIONAR PROMPT DE IMPORTACAO (se aplicavel)
 * -------------------------------------------------------
 * Arquivo: supabase/functions/_shared/build-import-prompt.ts
 * 
 * a) Adicionar ao DEFAULT_IMPORT_PROMPTS:
 *    prompt_import_novoCampo: {
 *      section: 'Nome do Campo',
 *      order: XX,  // Proximo numero disponivel
 *      prompt: `Instrucoes de extracao...`
 *    }
 * 
 * b) Adicionar ao IMPORT_JSON_TEMPLATE a propriedade JSON correspondente
 * 
 * c) Adicionar mapeamento em seed-prompts/index.ts cardMapping:
 *    prompt_import_novoCampo: { cardId: 'card-id', sectionId: 'novo-campo' }
 * 
 * 
 * PASSO 5: ADICIONAR PROMPT DE REGENERACAO (se aplicavel)
 * --------------------------------------------------------
 * Arquivo: supabase/functions/seed-prompts/index.ts
 * 
 * Adicionar ao objeto regenPrompts:
 *   prompt_regen_novoCampo: {
 *     cardId: 'card-id',
 *     sectionId: 'novo-campo',
 *     description: 'Nome do Campo - Regerar via PDF',
 *     order: XX,
 *     prompt: `Instrucoes de regeneracao...`
 *   }
 * 
 * 
 * PASSO 6: ADICIONAR PROMPT DE GERACAO (se analitico)
 * ----------------------------------------------------
 * Arquivo: supabase/functions/seed-prompts/index.ts
 * 
 * Adicionar ao objeto genPrompts:
 *   prompt_gen_novoCampo: {
 *     cardId: 'card-id',
 *     sectionId: 'novo-campo',
 *     description: 'Nome do Campo',
 *     order: XX,
 *     prompt: `Instrucoes de geracao...`,
 *     variables: ['var1', 'var2']  // Variaveis disponiveis
 *   }
 * 
 * 
 * PASSO 7: SINCRONIZAR NO DEVPANEL
 * ---------------------------------
 * 1. Acesse DevPanel > Prompts IA
 * 2. Clique em "Verificar Atualizacoes"
 * 3. Clique em "Sincronizar Labels (preserva conteudo)"
 * 4. Confirme que o novo campo aparece na secao correta
 * 
 * 
 * PASSO 8: TESTAR O FLUXO COMPLETO
 * ---------------------------------
 * a) Importacao: Upload de PDF e verificar se campo e preenchido
 * b) Regeneracao: Clicar no botao de refresh e verificar resultado
 * c) Geracao: Se analitico, verificar se gera corretamente
 * d) Edicao de Prompt: Editar no DevPanel e testar novamente
 * 
 */
```

---

## Arquivos a serem modificados

### 1. src/lib/laudo-structure.ts
- Adicionar documentacao completa no header do arquivo
- Adicionar constante `EXPECTED_PROMPT_TYPES` para cobertura

### 2. src/components/dev-panel/DevPrompts.tsx
- Adicionar calculo de `uncoveredSections` (secoes sem prompts)
- Adicionar componente `CoverageAlert` (banner de alerta)
- Adicionar componente `CoverageChecklist` (checklist detalhado)
- Integrar nova aba ou painel na UI

### 3. Nenhum arquivo de backend precisa ser alterado
- Toda a logica e de frontend, analisando os dados ja carregados

---

## Detalhes Tecnicos

### Calculo de secoes descobertas
```typescript
const uncoveredSections = useMemo(() => {
  const results: { cardId: string; sectionId: string; label: string; cardLabel: string }[] = [];
  
  // Apenas LAUDO_CARDS_STRUCTURE (exclui PROMPT_ONLY_CARDS)
  for (const card of LAUDO_CARDS_STRUCTURE) {
    for (const section of card.sections) {
      const count = getSectionPromptCount(card.id, section.id);
      if (count === 0) {
        results.push({
          cardId: card.id,
          sectionId: section.id,
          label: section.label,
          cardLabel: card.label
        });
      }
    }
  }
  
  return results;
}, [groupedPrompts]);
```

### Checklist de tipos esperados
```typescript
const EXPECTED_PROMPT_TYPES: Record<string, ('import' | 'gen' | 'regen')[]> = {
  // Preliminares
  'perito': [],  // Preenchimento manual
  'processo': ['import'],
  'objetivo': [],  // Preenchimento manual
  'documentos': [],  // Checkbox manual
  
  // Resumo dos Autos
  'resumo': ['import', 'regen'],
  'metodologia': [],  // Preenchimento manual
  
  // Periciando
  'vitima': ['import'],
  'acidente': ['import', 'regen'],
  'anamnese': ['import', 'regen'],
  'antecedentes': ['import', 'regen'],
  
  // Posto de Trabalho
  'dados-posto': ['import', 'regen'],
  
  // Exame Clinico
  'laudos': ['import', 'regen'],
  'exames': ['import', 'regen'],
  'exame-fisico': ['import', 'regen'],
  
  // Analise Tecnica
  'descricao-doencas': ['import', 'gen', 'regen'],
  'nexo': ['import', 'gen'],
  'analise-incapacidade': ['import', 'gen'],
  
  // Conclusao
  'conclusao': ['regen'],
  'sequelas': ['import', 'regen'],
  'quesitos': ['import'],
  
  // Referencias
  'referencias': ['gen']
};
```

---

## Beneficios esperados

1. **Visibilidade imediata**: Ao adicionar uma nova secao, o sistema alertara automaticamente que ela nao tem prompts
2. **Checklist claro**: Saber exatamente quais tipos de prompt estao faltando para cada secao
3. **Documentacao contextual**: Guia passo-a-passo no proprio codigo para evitar erros de implementacao
4. **Prevencao de bugs**: Evitar situacoes onde um campo e adicionado mas nao tem prompt configurado


# Plano de Refatoracao e Otimizacao do Sistema Pericial

## Visao Geral

Este plano aborda 6 grandes areas de melhorias solicitadas, organizadas em ordem de prioridade tecnica e dependencias entre si.

---

## PARTE 1: Reestruturacao da UI e Fluxo

### 1.1 Refatoracao da Secao "Descricao Tecnica das Doencas"

**Arquivo:** `src/components/laudo/sections/DescricaoTecnicaDoencas.tsx`

**Mudancas:**

| Elemento | Estado Atual | Estado Futuro |
|----------|--------------|---------------|
| Campo "Inserir CID" | Substitui texto "{CID}" nos campos | Gera descricao tecnica via IA |
| Campo "Descricao Tecnica" | Pre-preenchido na importacao | Inicia VAZIO, recebe dados sob demanda |
| Botao "Aplicar" | Localizar/substituir | Chama IA e ADICIONA texto ao final |
| Multiplos CIDs | Nao suportado | Aceita lista separada por virgula |

**Nova Logica do Botao "Aplicar":**

```text
Usuario digita: "M54.5, G56.0, M75.1"
         |
         v
Clica em "Aplicar"
         |
         v
Edge Function busca descricao oficial de cada CID
         |
         v
Retorna texto formatado para cada CID:
  - Nome completo
  - Definicao tecnica
  - Etiologia
  - Caracteristicas clinicas
         |
         v
ADICIONA ao campo "Descricao Tecnica" (abaixo do existente)
```

**Componente Refatorado:**
- Input aceita multiplos CIDs (placeholder: "Ex: M54.5, G56.0")
- Botao "Aplicar" chama novo endpoint `gerar-resumos` com tipo `descricao_cid`
- Loading state durante busca
- Texto gerado e CONCATENADO (append) ao campo existente
- Separador visual entre blocos de CIDs diferentes

**Edge Function:** Adicionar novo tipo `descricao_cid` em `gerar-resumos` que:
1. Recebe lista de CIDs
2. Gera descricao tecnica de cada um
3. Formata com titulos em CAIXA ALTA
4. Retorna texto organizado

---

### 1.2 Fusao de Campos: "Dados do Posto de Trabalho"

**Arquivo:** `src/components/laudo/sections/DadosPostoTrabalho.tsx`

**Mudanca:** Remover o campo "Descricao do Posto de Trabalho" e manter apenas "Descricao das Atividades Laborais"

| Campo Atual | Acao |
|-------------|------|
| `descricaoPostoTrabalho` | REMOVER do componente |
| `descricaoAtividadesLaborais` | MANTER e expandir placeholder |

**Novo Placeholder do Campo Unificado:**
```
Descreva o ambiente de trabalho (mobiliario, equipamentos, condicoes ergonomicas), 
bem como as atividades desenvolvidas pelo trabalhador, incluindo movimentos 
repetitivos, posturas adotadas, carga de trabalho e jornada...
```

**IMPORTANTE - Migrar dados existentes:**
- No LaudoContext, ao carregar laudo: se `descricaoPostoTrabalho` tiver conteudo e `descricaoAtividadesLaborais` estiver vazio, concatenar os dois
- Prompt de extracao do PDF deve ser atualizado para consolidar tudo neste unico campo

**Impacto no PDF:**
- Em `generateLaudoPDF.ts`: Remover linhas 528-532 que renderizam `descricaoPostoTrabalho` separadamente
- Ajustar subtitulo para "Ambiente e Atividades Laborais"

---

### 1.3 Conversao RadioGroup para Checkboxes - Analise de Incapacidade

**Arquivo:** `src/components/laudo/sections/AnaliseIncapacidade.tsx`

**Estado Atual:** RadioGroup com 5 opcoes (selecao unica)
**Estado Futuro:** Grupo de Checkboxes (multipla selecao)

**Mudancas Tecnicas:**

```typescript
// Antes: string unico
conclusaoStatus: string

// Depois: array de strings
incapacidadeTipos: string[] 
```

**Novo Componente:**
- Substituir `<RadioGroup>` por grupo de `<Checkbox>` individuais
- Handler alterna items no array
- Salvar como JSON array no banco (campo `conclusao_status` aceita texto, converter para JSON stringify)

**Mapeamento de Dados:**
| Valor | Label |
|-------|-------|
| `total_temporaria` | Incapacidade Total Temporaria |
| `parcial_permanente` | Incapacidade Parcial Permanente |
| `parcial_temporaria` | Incapacidade Parcial Temporaria |
| `ausencia` | Ausencia de Incapacidade |
| `total_permanente` | Incapacidade Total Permanente |

---

### 1.4 Correcao de Formatacao dos Quesitos

**Problema:** Quesitos do Reclamante e Reclamada saindo em bloco unico no PDF
**Solucao:** Verificar e ajustar a funcao `addParagraph` para respeitar quebras de linha

**Arquivo:** `src/utils/generateLaudoPDF.ts`

**Analise:** A funcao `addParagraph` ja utiliza `splitTextToSize`, mas o texto original pode estar vindo sem `\n` adequados. A correcao deve ser:

1. No prompt de extracao (`processar-autos`): Garantir que cada quesito venha em linha separada
2. No PDF: Processar linhas individualmente quando detectar padrao de quesito numerado

**Regex para detectar quesitos:**
```typescript
const isQuesito = /^\d+[\.\)]\s/.test(line.trim());
// Matches: "1. Texto", "1) Texto", "2. Texto", etc.
```

---

### 1.5 Markdown no PDF - Remover Asteriscos

**Problema:** Texto exportado exibe `**texto**` ao inves de negrito
**Solucao:** Sanitizar markdown antes de renderizar

**Arquivo:** `src/utils/generateLaudoPDF.ts`

**Funcao de Sanitizacao:**
```typescript
const sanitizeMarkdown = (text: string): string => {
  return text
    .replace(/\*\*(.+?)\*\*/g, (_, p1) => p1.toUpperCase()) // **texto** -> TEXTO
    .replace(/\*(.+?)\*/g, '$1')  // *texto* -> texto
    .replace(/__(.+?)__/g, (_, p1) => p1.toUpperCase()) // __texto__ -> TEXTO
    .replace(/_(.+?)_/g, '$1'); // _texto_ -> texto
};
```

**Aplicar em:** Todas as chamadas de `addParagraph`, `addLabeledField`, etc.

---

## PARTE 2: Gestao de Estado e Cache

### 2.1 Reset de Estado ao Importar Novo PDF

**Problema Identificado:** Dados de laudo anterior persistem ao abrir novo laudo

**Arquivo Principal:** `src/contexts/LaudoContext.tsx`

**Arquivos Secundarios:**
- `src/components/laudo/sections/DescricaoTecnicaDoencas.tsx` (estado local `sidValue`)
- Outros componentes com `useState` local

**Solucao:**

1. **LaudoContext - Reset Explícito:**
   - Quando `createLocalLaudo()` e chamado, garantir que TODOS os campos iniciam vazios
   - Quando `loadLaudo(id)` e chamado para ID diferente, limpar `currentLaudo` primeiro

2. **Componentes com Estado Local:**
   - Adicionar `useEffect` que reseta estado local quando `currentLaudo.id` muda:

```typescript
// Em DescricaoTecnicaDoencas.tsx
useEffect(() => {
  setSidValue(""); // Reset ao trocar de laudo
}, [currentLaudo?.id]);
```

3. **Campo descricaoTecnicaDoencas:**
   - Inicializar como string vazia `""` no `createLocalLaudo`
   - NAO pre-popular durante importacao (deixar para o perito adicionar via botao CID)

---

## PARTE 3: Referencias Bibliograficas Inteligentes

### 3.1 Logica de Referencias

**Arquivo:** `supabase/functions/gerar-resumos/index.ts`

**Nova Logica:**

| Referencia | Comportamento |
|------------|---------------|
| Schilling (1983) | **SEMPRE** incluir |
| Bradford-Hill (1965) | **SEMPRE** incluir |
| Simonin (1960) | **SEMPRE** incluir |
| ANAMT (2026) | **CONDICIONAL** - apenas se detectar ASO/PCMSO no documento |
| Dinamicas | IA complementa com referencias pertinentes aos CIDs |

**Deteccao de ASO/PCMSO:**
- Durante extracao do PDF, o sistema ja extrai campo `documentos_checklist`
- Verificar se existe mencao a "ASO", "PCMSO", "Atestado de Saude Ocupacional"
- Passar flag `hasOccupationalDocs: boolean` para o prompt de referencias

**Prompt Atualizado:**
```
REFERENCIAS OBRIGATORIAS (sempre incluir):
1- SCHILLING, R.S.F. More effective prevention in occupational health practice. J Soc Occup Med, v. 33, p. 71-79, 1983.
2- BRADFORD HILL, A. The Environment and Disease: Association or Causation? Proc R Soc Med, v. 58, p. 295-300, 1965.
3- SIMONIN, C. Medicina Legal Judicial. Barcelona: Editorial JIMS, 1960.

${hasOccupationalDocs ? 
  '4- ASSOCIACAO NACIONAL DE MEDICINA DO TRABALHO. Diretrizes para avaliacao de nexo tecnico. Sao Paulo: ANAMT, 2026.' : 
  ''}

REFERENCIAS DINAMICAS:
Com base nos CIDs ${cids}, adicione 3-4 referencias especificas e reais...
```

---

## PARTE 4: Otimizacao de Prompts Tecnicos

### 4.1 Nexo Causal - Criterios Obrigatorios

**Arquivo:** `supabase/functions/gerar-resumos/index.ts` (prompt `nexo_causal`)

**Criterios a Incluir no Prompt:**

1. **Classificacao de Schilling (I-IV)**
   - Grupo I: Doenca ocupacional tipica (trabalho e causa necessaria)
   - Grupo II: Doenca agravada pelo trabalho (concausa)
   - Grupo III: Doenca comum sem relacao (ausencia de nexo)
   - Grupo IV: Doenca do trabalho (lista de doencas ocupacionais)

2. **Criterios de Simonin**
   - Mecanismo: compatibilidade entre exposicao e patologia
   - Cronologia: tempo de exposicao vs surgimento
   - Exclusao de causas extraocupacionais

3. **Criterios de Bradford-Hill**
   - Forca da associacao
   - Consistencia
   - Especificidade
   - Temporalidade
   - Gradiente biologico
   - Plausibilidade
   - Coerencia
   - Evidencia experimental
   - Analogia

4. **ANAMT** (se houver ASO/PCMSO)
   - Citar diretrizes ocupacionais

5. **Declaracao de insuficiencia**
   - Se faltar dado critico: "Informacao insuficiente para estabelecer nexo"

---

### 4.2 Analise de Incapacidade - Criterios Obrigatorios

**Arquivo:** `supabase/functions/gerar-resumos/index.ts` (prompt `incapacidade`)

**Estrutura do Prompt:**

```
A analise de incapacidade deve abordar OBRIGATORIAMENTE:

1. EXIGENCIAS DA FUNCAO
   - Descrever as demandas fisicas/cognitivas do cargo

2. BASE CLINICA OBJETIVA
   - Achados do exame fisico
   - Resultados de exames complementares
   - CIDs diagnosticados

3. LIMITACOES FUNCIONAIS
   - O que o periciando NAO consegue fazer
   - Restricoes de movimento, forca, cognicao

4. CORRELACAO COM NEXO
   - Aplicar Schilling para classificar a origem
   - Aplicar Simonin para verificar mecanismo/cronologia
   - Aplicar Bradford-Hill para fundamentar a associacao
   - Se houver ASO/PCMSO, citar ANAMT

Concluir com classificacao:
- Incapacidade Total Temporaria / Parcial Temporaria
- Incapacidade Total Permanente / Parcial Permanente
- Ausencia de Incapacidade
```

---

## PARTE 5: Arquivos a Modificar (Resumo)

| Arquivo | Modificacoes |
|---------|--------------|
| `src/components/laudo/sections/DescricaoTecnicaDoencas.tsx` | Refatorar para buscar CIDs via IA e append |
| `src/components/laudo/sections/DadosPostoTrabalho.tsx` | Remover campo duplicado |
| `src/components/laudo/sections/AnaliseIncapacidade.tsx` | Converter para Checkboxes |
| `src/contexts/LaudoContext.tsx` | Reset de estado ao trocar laudo |
| `src/utils/generateLaudoPDF.ts` | Sanitizar markdown, formatar quesitos |
| `supabase/functions/gerar-resumos/index.ts` | Novo tipo `descricao_cid`, atualizar prompts |
| `supabase/functions/processar-autos/index.ts` | Atualizar prompt de extracao |

---

## PARTE 6: Ordem de Implementacao Sugerida

```
FASE 1 (Prioridade Alta - Corrigir bugs)
├── 2.1 Reset de estado ao importar PDF
├── 1.4 Formatacao dos quesitos
└── 1.5 Markdown no PDF

FASE 2 (Refatoracao de UI)
├── 1.1 Descricao Tecnica das Doencas
├── 1.2 Fusao de campos Posto de Trabalho
└── 1.3 Checkboxes de Incapacidade

FASE 3 (Otimizacao de Prompts)
├── 4.1 Nexo Causal com criterios
├── 4.2 Incapacidade com criterios
└── 3.1 Referencias bibliograficas
```

---

## Observacoes Tecnicas

1. **Nao existe banco de CIDs local**: A geracao de descricoes sera 100% via IA em tempo real

2. **Campo unificado de Posto de Trabalho**: Dados existentes serao migrados automaticamente

3. **Checkboxes de Incapacidade**: Suporta multipla selecao, serializado como JSON array

4. **Prompts de Nexo/Incapacidade**: Os prompts serao grandes e detalhados - isso e intencional para garantir qualidade medico-legal

5. **ANAMT Condicional**: A deteccao de ASO/PCMSO sera feita via analise de texto, nao checkbox manual

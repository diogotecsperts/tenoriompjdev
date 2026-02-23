

# Correção de Pipeline: Fallback de Conclusão e Sanitização de Acentos

## Diagnóstico

### Problema 1: Campos `conclusao_analise` e `conclusao_destino` vazios
Atualmente, `conclusao_analise` é intencionalmente deixado vazio na importação (linha 1077 do ImportarAutosDialog: `conclusao_analise: ''`). O campo `conclusao_destino` depende de `extractedData.informacoes_medicas` que frequentemente chega vazio por Task Overload do LLM na extração inicial (JSON gigante). Nenhum destes campos possui sub-rotina de fallback no `gerarResumosIA`.

### Problema 2: Acentuação em campos curtos gerados via JSON
Campos curtos como `tabela_susep`, `dano_estetico`, `auxilio_terceiros` são extraídos dentro do JSON principal pelo LLM, que frequentemente omite diacríticos em saídas JSON (ex: "lesao" em vez de "lesão").

---

## Alterações

### Arquivo 1: `supabase/functions/processar-autos/index.ts`

#### Mudança 1: Função `sanitizeOcrAccents` (nova, antes de `gerarResumosIA`)

Adicionar a função utilitária de higienização com dicionário regex:

```typescript
function sanitizeOcrAccents(text: string | undefined): string {
  if (!text) return '';
  const dict: Record<string, string> = {
    'lesao': 'lesão', 'lesoes': 'lesões',
    'reducao': 'redução', 'funcao': 'função',
    'avaliacao': 'avaliação', 'conclusao': 'conclusão',
    'nao': 'não', 'sao': 'são',
    'medico': 'médico', 'medica': 'médica',
    'fisica': 'física', 'clinica': 'clínica',
    'periodo': 'período', 'pos-hospitalar': 'pós-hospitalar',
    'peticao': 'petição', 'acao': 'ação',
    'profissao': 'profissão', 'funcoes': 'funções',
    'orgao': 'órgão', 'orgaos': 'órgãos',
    'infeccao': 'infecção', 'operacao': 'operação',
    'reabilitacao': 'reabilitação', 'limitacao': 'limitação',
    'incapacidade': 'incapacidade', 'invalidez': 'invalidez',
    'estetico': 'estético', 'estetica': 'estética',
    'auxilio': 'auxílio', 'necessario': 'necessário',
    'permanente': 'permanente', 'temporaria': 'temporária',
    'sequela': 'sequela', 'cicatriz': 'cicatriz'
  };

  let sanitized = text;
  for (const [key, value] of Object.entries(dict)) {
    const regex = new RegExp(`\\b${key}\\b`, 'gi');
    sanitized = sanitized.replace(regex, (match) => {
      return match.charAt(0) === match.charAt(0).toUpperCase()
        ? value.charAt(0).toUpperCase() + value.slice(1)
        : value;
    });
  }
  return sanitized;
}
```

#### Mudança 2: Aplicar `sanitizeOcrAccents` nos campos de `extractedData`

Logo apos a normalização do `extractedData` (apos `normalizeExtractedData`), em cada pipeline (Mistral OCR pipeline ~linha 2540, chunked pipeline, e two-phase pipeline), adicionar:

```typescript
// Sanitize accent-prone short fields
if (extractedData.avaliacao_sequelas) {
  extractedData.avaliacao_sequelas.tabela_susep = sanitizeOcrAccents(extractedData.avaliacao_sequelas.tabela_susep);
  extractedData.avaliacao_sequelas.dano_estetico = sanitizeOcrAccents(extractedData.avaliacao_sequelas.dano_estetico);
  extractedData.avaliacao_sequelas.auxilio_terceiros = sanitizeOcrAccents(extractedData.avaliacao_sequelas.auxilio_terceiros);
}
if (extractedData.historico) {
  extractedData.historico.historia_atual = sanitizeOcrAccents(extractedData.historico.historia_atual);
  extractedData.historico.antecedentes_patologicos = sanitizeOcrAccents(extractedData.historico.antecedentes_patologicos);
  extractedData.historico.tratamentos_realizados = sanitizeOcrAccents(extractedData.historico.tratamentos_realizados);
}
if (extractedData.exame_clinico) {
  extractedData.exame_clinico.exame_fisico = sanitizeOcrAccents(extractedData.exame_clinico.exame_fisico);
  extractedData.exame_clinico.laudos_medicos = sanitizeOcrAccents(extractedData.exame_clinico.laudos_medicos);
}
```

#### Mudança 3: Novos prompts para `conclusao` e `destino_sugerido`

Adicionar ao `PROMPT_ID_MAPPING`:

```typescript
conclusao: 'prompt_gen_conclusao',
destino_sugerido: 'prompt_gen_destino_sugerido'
```

Adicionar ao `DEFAULT_PROMPTS`:

```typescript
conclusao: `Você é um perito médico do trabalho. Com base nos dados do caso, elabore a análise conclusiva do laudo pericial.

DADOS DO CASO:
- CIDs: ${cids}
- Nexo causal: ${nexoCausal}
- Incapacidade: ${incapacidade}
- História atual: ${historiaAtual}
- Exame físico: ${exameFisico}

Elabore uma conclusão técnica fundamentada que sintetize:
1. O diagnóstico confirmado e os CIDs pertinentes
2. A relação causal com a atividade laboral (nexo)
3. O grau e tipo de incapacidade constatada
4. Prognóstico e recomendações

Seja objetivo e imparcial. Máximo 4 parágrafos.`,

destino_sugerido: `Você é um perito médico do trabalho. Com base na análise do caso, indique o destino/encaminhamento sugerido para o periciando.

DADOS DO CASO:
- CIDs: ${cids}
- Incapacidade: ${incapacidade}
- Nexo causal: ${nexoCausal}

Indique de forma direta e objetiva o destino sugerido. Exemplos: "Retorno ao trabalho sem restrições", "Reabilitação profissional", "Aposentadoria por invalidez", "Manutenção do benefício por incapacidade temporária".

Responda em no máximo 2 frases.`
```

#### Mudança 4: Adicionar ao `results` e `summariesToGenerate`

No objeto `results` (linha 1116), adicionar:

```typescript
conclusao: '',
destino_sugerido: ''
```

No array `summariesToGenerate` (linha 1227), adicionar apos `incapacidade` e antes dos resumos:

```typescript
{ tipo: 'conclusao', shouldGenerate: !contexto.conclusao || contexto.conclusao.length < 50, step: 'Gerando análise conclusiva...', progress: 72 },
{ tipo: 'destino_sugerido', shouldGenerate: !contexto.destinoSugerido || (contexto.destinoSugerido || '').length < 5, step: 'Definindo destino sugerido...', progress: 74 },
```

Ajustar os valores de `progress` dos itens subsequentes para manter a progressão.

#### Mudança 5: Atualizar contexto dinamicamente apos gerar conclusao

No bloco de atualização dinâmica do contexto (linha 1332), adicionar:

```typescript
} else if (tipo === 'conclusao') {
  contexto.conclusao = result.text;
}
```

#### Mudança 6: Adicionar variáveis ao `interpolationContext`

Adicionar `destinoSugerido` ao objeto (linha 914):

```typescript
destinoSugerido: ctx.destinoSugerido || '',
```

### Arquivo 2: `src/components/tools/ImportarAutosDialog.tsx`

#### Mudança 7: Mapear novos resumos para campos do laudo

Na seção de mapeamento (linha 1076), alterar:

```typescript
// ANTES:
conclusao_analise: '',

// DEPOIS:
conclusao_analise: extractedData.resumos_ia?.conclusao || '',
conclusao_destino: extractedData.resumos_ia?.destino_sugerido || extractedData.conclusao_destino || '',
```

### Arquivo 3: `supabase/functions/seed-prompts/index.ts`

#### Mudança 8: Adicionar prompts de conclusao e destino ao seed

Adicionar os templates para `prompt_gen_conclusao` e `prompt_gen_destino_sugerido` com os mesmos textos dos DEFAULT_PROMPTS, com `cardId: 'conclusao'` e `sectionId: 'conclusao'`.

---

## O que NÃO muda

- sanitizeQuesitos permanece ativa
- Prompts de quesitos simplificados permanecem
- textoProcesso integral permanece
- Lógica de Progressive Save permanece

## Deploy

`processar-autos` e `seed-prompts`


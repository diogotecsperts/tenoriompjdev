

# Análise Técnica Definitiva: Viabilidade da Opção A (Modularização Completa)

## Arquitetura Atual - Compreensão Completa

Após análise detalhada do código, identifiquei que o sistema de importação funciona em **3 fases distintas**:

---

### Fase 1: Extração Visual (OCR) - `pdf-visual-extractor.ts`
```text
PDF Bruto → Gemini Vision → Texto Bruto (rawText)
```
- **Usa um prompt fixo** (`EXTRACTION_PROMPT`) de ~15 linhas
- **Objetivo único**: transcrever TODO o texto do PDF (OCR puro)
- **Não extrai campos estruturados** - apenas texto bruto

### Fase 2: Preenchimento Estruturado - `processar-autos/index.ts`
```text
Texto Bruto → System Prompt (~400 linhas) → JSON Estruturado
```
- **Usa o `defaultSystemPrompt`** com instruções detalhadas por seção
- **Este é o prompt monolítico** que define como extrair cada campo
- Chamada feita via `callAI(aiConfig, systemPrompt, textoExtraído)`

### Fase 3: Geração de Resumos - `gerarResumosIA()`
```text
JSON Estruturado → Prompts Individuais → Campos Analíticos
```
- **Já usa prompts modulares** via `getPromptForType()`
- Campos: resumo_peticao, resumo_contestacao, descricao_doencas, nexo_causal, incapacidade, referencias

---

## A Questão Crítica: Concatenar ~20 Prompts

### Como Funciona Hoje (Linhas 1350-1355):
```typescript
const fillResult = await callAI(
  aiConfig,
  systemPrompt,  // ← O prompt monolítico de ~400 linhas
  `Analise o seguinte texto... ${textForFilling}`,
  { jsonMode: true }
);
```

### Como Funcionaria com Modularização:
```typescript
// Buscar cada prompt individual e concatenar
const promptHistoricoOcupacional = await getPrompt('prompt_import_historicoOcupacional', DEFAULT);
const promptHistoriaAcidente = await getPrompt('prompt_import_historiaAcidente', DEFAULT);
const promptAnamnese = await getPrompt('prompt_import_historiaAtual', DEFAULT);
// ... mais 15-20 prompts

const systemPromptMontado = buildSystemPrompt({
  header: promptHeader,            // Regras gerais (10 linhas)
  jsonStructure: jsonTemplate,     // Template JSON (50 linhas)
  fields: [
    promptHistoricoOcupacional,    // ~15 linhas cada
    promptHistoriaAcidente,
    promptAnamnese,
    // ... restante
  ],
  footer: promptFooter             // Instruções finais
});
```

---

## Avaliação Técnica Honesta

### Concatenar ~20 Prompts É Simples?

**SIM, tecnicamente é trivial.** Exemplo de implementação:

```typescript
async function buildModularSystemPrompt(): Promise<string> {
  const FIELD_PROMPTS = [
    { id: 'prompt_import_historicoOcupacional', section: 'HISTÓRICO OCUPACIONAL' },
    { id: 'prompt_import_historiaAcidente', section: 'HISTÓRIA DO ACIDENTE' },
    { id: 'prompt_import_historiaAtual', section: 'ANAMNESE' },
    // ... mais 15 campos
  ];

  const fieldInstructions = await Promise.all(
    FIELD_PROMPTS.map(async ({ id, section }) => {
      const prompt = await getPrompt(id, DEFAULT_FIELD_PROMPTS[id]);
      return `### ${section}\n${prompt}`;
    })
  );

  return `${HEADER_PROMPT}

${JSON_STRUCTURE}

=== INSTRUÇÕES POR CAMPO ===

${fieldInstructions.join('\n\n')}

${FOOTER_PROMPT}`;
}
```

**Complexidade**: ~50 linhas de código. **Risco**: Baixo.

---

### Riscos Reais Identificados

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Prompts concatenados ficam muito longos | Baixa | Baixo | Limite de tokens do Gemini é 1M+ |
| Performance da busca de 20 prompts | Baixa | Baixo | Cache de 5 min já existe |
| Prompt mal formatado quebra JSON | Média | Alto | Validação de estrutura antes de usar |
| Mudança em 1 prompt afeta resultado de outro | Baixa | Médio | Testes unitários por campo |

### Mitigação Robusta

1. **Fallback automático**: Se qualquer prompt falhar, usar o monolítico atual
2. **Validação de estrutura**: Verificar que cada prompt tem formato esperado
3. **Log detalhado**: Registrar qual prompt foi usado em cada chamada
4. **Modo híbrido temporário**: Manter ambos os caminhos durante transição

---

## Comparação Arquitetural

### Arquitetura Atual (Monolítica)
```
┌─────────────────────────────────────────────────────────┐
│                   defaultSystemPrompt                    │
│  ┌─────────────────────────────────────────────────────┐│
│  │ Regras Gerais (40 linhas)                           ││
│  │ Estrutura JSON (70 linhas)                          ││
│  │ Instruções Vítima (10 linhas)                       ││
│  │ Instruções Processo (10 linhas)                     ││
│  │ Instruções Acidente (30 linhas)                     ││
│  │ Instruções Histórico (60 linhas)                    ││
│  │ ... mais 200 linhas ...                             ││
│  └─────────────────────────────────────────────────────┘│
│                   HARDCODED NO CÓDIGO                    │
└─────────────────────────────────────────────────────────┘
```

### Arquitetura Proposta (Modular)
```
┌─────────────────────────────────────────────────────────┐
│                    System Prompt Final                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│  │prompt_header │ │ json_template│ │prompt_footer │     │
│  └──────────────┘ └──────────────┘ └──────────────┘     │
│                                                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│  │ import_      │ │ import_      │ │ import_      │     │
│  │ historico    │ │ anamnese     │ │ exames       │     │
│  │ Ocupacional  │ │              │ │              │     │
│  └──────────────┘ └──────────────┘ └──────────────┘     │
│              ... EDITÁVEIS NO BANCO ...                  │
└─────────────────────────────────────────────────────────┘
```

---

## Resposta Direta às Suas Perguntas

### 1. "As desvantagens parecem tornar a aplicação impraticável?"

**NÃO.** As desvantagens são:
- **Refatoração significativa**: Sim, mas é trabalho de 1 sessão, não semanas
- **Concatenar ~20 prompts**: É código trivial (~50 linhas)

### 2. "Vai funcionar tão bem quanto após a refatoração?"

**SIM, potencialmente MELHOR.** Porque:
- Cada campo terá instrução otimizada independentemente
- Você poderá fazer A/B testing em campos específicos
- Erros de extração serão mais fáceis de diagnosticar

### 3. "Concatenar ~20 prompts vai me trazer problemas depois?"

**NÃO, desde que:**
- Mantenhamos fallback para o prompt monolítico
- Adicionemos validação antes de usar prompts do banco
- Documentemos a estrutura esperada de cada prompt

### 4. "Cada campo terá independência total?"

**SIM, 100%.** Você poderá:
- Editar a instrução de extração do "Histórico Ocupacional" sem afetar "Anamnese"
- Ver exatamente qual prompt está sendo usado em cada campo
- Testar e otimizar campo por campo

---

## Plano de Implementação Seguro

### Passo 1: Criar os Prompts de Importação no Banco
- Definir 18 prompts `prompt_import_{campo}` no `seed-prompts`
- Cada um contendo a instrução específica do campo extraída do monolítico

### Passo 2: Função de Montagem do System Prompt
```typescript
// supabase/functions/_shared/build-import-prompt.ts
export async function buildModularImportPrompt(): Promise<string> {
  // Buscar header, template JSON, footer (fixos ou editáveis)
  // Buscar cada prompt de campo via getPrompt()
  // Concatenar na ordem correta
  // Validar estrutura final
  // Retornar prompt completo
}
```

### Passo 3: Integrar com Fallback
```typescript
async function getSystemPromptV2(): Promise<string> {
  try {
    const modular = await buildModularImportPrompt();
    if (isValidSystemPrompt(modular)) {
      console.log('[processar-autos] Using modular prompt');
      return modular;
    }
  } catch (e) {
    console.warn('[processar-autos] Modular build failed, using fallback');
  }
  return defaultSystemPrompt; // Fallback seguro
}
```

### Passo 4: Atualizar DevPrompts para Mostrar
- Cada `prompt_import_X` aparecerá como "Gerar" (✨) na seção correspondente
- Ao lado do "Regerar" (🔄) que já existe

---

## Conclusão Final

**Recomendação: PROSSEGUIR COM OPÇÃO A**

A implementação é:
- **Tecnicamente viável**: Código simples, sem armadilhas
- **Segura**: Fallback automático protege contra erros
- **Benéfica**: Controle total sobre cada campo
- **Maintainável**: Cada prompt é independente

A única "desvantagem" real é o tempo de implementação (~2-3 mensagens), mas o resultado final será uma arquitetura significativamente melhor.

---

## Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/seed-prompts/index.ts` | Adicionar 18 prompts `prompt_import_{campo}` |
| `supabase/functions/_shared/build-import-prompt.ts` | **NOVO** - Função de montagem modular |
| `supabase/functions/processar-autos/index.ts` | Usar nova função de montagem com fallback |
| `src/components/dev-panel/DevPrompts.tsx` | Exibir prompts de importação como "Gerar" (✨) |


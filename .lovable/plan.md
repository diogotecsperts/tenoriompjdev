
# Plano — Correção de Estabilidade da Importação de PDF

## Diagnóstico Completo (Baseado em Dados Reais)

### Problema 1: Jobs travando em "Analisando incapacidade laboral..."

Analisei todos os jobs recentes e identifiquei o padrão:

| Job ID | Modelo | Status | Travou em | Duração |
|---|---|---|---|---|
| `926c2156` | gemini-3.1-pro | processing (abandonado) | incapacidade (85%) | 393s |
| `8a9e27f0` | z-ai/glm-5 | processing (abandonado) | incapacidade (85%) | 384s |
| `5c4f8a56` | z-ai/glm-5 | processing (abandonado) | referencias (92%) | 390s |
| `a6c78e7e` | gemini-3-flash | completed | - | 110s |

**Causa raiz identificada: ausencia de heartbeat durante a geracao de resumos.**

A funcao `gerarResumosIA` e chamada na linha 2579 SEM heartbeat. Cada chamada `callAI` pode levar:
- gemini-3-flash: ~8-12s por resumo
- gemini-3.1-pro: ~40-86s por resumo
- z-ai/glm-5: ~35-71s por resumo

Para modelos lentos como gemini-3.1-pro:
1. `descricao_doencas`: 86s
2. `nexo_causal`: 41s
3. Atualiza job para "Analisando incapacidade laboral..." e inicia a chamada
4. A chamada `callAI` fica pendente (>120s no gemini-3.1-pro para prompts complexos)
5. Durante essa espera, `updated_at` NAO e atualizado (sem heartbeat)
6. Apos ~300s sem atualizacao, o frontend detecta "stale"
7. A funcao e morta pelo `wall_clock_limit` (600s) SEM registrar erro

O `SUMMARY_TIMEOUT_MS` de 120s deveria proteger, mas:
- Se `descricao_doencas` (86s) + `nexo_causal` (41s) + tempo de OCR (~50s) + overhead = ~300s ja consumidos
- Sobram ~300s para os 3 resumos restantes
- Se `incapacidade` demora >120s, o timeout dispara, mas o `catch` grava no log e tenta o proximo
- O problema real e que o heartbeat nao roda, entao o frontend pensa que travou

### Problema 2: Mistral OCR falhando

O bug de `pdfBytesBackup` (ja corrigido) impedia o fallback para Gemini quando Mistral falhava. Agora o fallback deve funcionar. Porem, o frontend NAO mostra quando o fallback assume durante o processamento — o usuario fica sem visibilidade.

Os logs de `ai_usage_logs` com `success: false` mostram que a maioria das falhas sao por **contexto excedendo o limite de tokens do modelo** (147K tokens de input vs 204K de limite), NAO falhas do Mistral em si. O Mistral extrai ~147K tokens de texto, e modelos com janela <200K falham na etapa de estruturacao.

### Problema 3: Sem indicador de fallback durante processamento

O `check-import-status` detecta o provedor OCR pelo texto do `current_step`, mas nao ha mecanismo para informar o frontend quando um fallback assume. O indicador de fallback so aparece na preview final (apos completar).

---

## Operacoes de Implementacao

### Operacao A — Heartbeat durante geracao de resumos

Em `supabase/functions/processar-autos/index.ts`, adicionar `startHeartbeat` antes de `gerarResumosIA` e `stopHeartbeat` apos:

```typescript
// ANTES (linha 2574-2582):
console.log("[processar-autos] Starting AI summary generation...");
timings.summaries.start = Date.now();
const resumosResult = await gerarResumosIA(extractedData, supabaseAdmin, jobId, userId);
timings.summaries.end = Date.now();

// DEPOIS:
console.log("[processar-autos] Starting AI summary generation...");
timings.summaries.start = Date.now();
startHeartbeat('AI summary generation');  // <-- NOVO
const resumosResult = await gerarResumosIA(extractedData, supabaseAdmin, jobId, userId);
stopHeartbeat();  // <-- NOVO
timings.summaries.end = Date.now();
```

Isso garante que `updated_at` e atualizado a cada 12s durante TODA a geracao de resumos, impedindo falsos positivos de "stale job" no frontend.

### Operacao B — Orcamento de tempo para resumos

Na funcao `gerarResumosIA`, adicionar verificacao de tempo restante antes de cada resumo. A funcao precisa receber o `startTime` da funcao pai para calcular quanto tempo resta do `wall_clock_limit` (600s):

```typescript
// Assinatura atualizada:
async function gerarResumosIA(
  extractedData: any,
  supabaseAdmin: any,
  jobId: string,
  userId: string,
  functionStartTime: number  // <-- NOVO parametro
)
```

Antes de cada resumo no loop (linha 1100), adicionar:

```typescript
// Check remaining time budget (600s wall_clock_limit)
const WALL_CLOCK_LIMIT_MS = 600_000;
const SAFETY_MARGIN_MS = 30_000; // 30s margem para finalizar
const elapsed = Date.now() - functionStartTime;
const remaining = WALL_CLOCK_LIMIT_MS - elapsed;

if (remaining < SAFETY_MARGIN_MS) {
  console.warn(`[gerarResumosIA] Time budget exhausted (${Math.round(elapsed/1000)}s elapsed). Skipping remaining summaries.`);
  await logWarn('processar-autos', 
    `Orcamento de tempo esgotado apos ${Math.round(elapsed/1000)}s. Resumos restantes pulados.`, 
    jobId, { skipped: tipo, elapsed: Math.round(elapsed/1000) }
  );
  summaryErrors.push(`${tipo}: Tempo limite da funcao atingido`);
  break; // Sai do loop para permitir finalizacao
}
```

Na chamada (linha 2579), passar o timestamp:

```typescript
const resumosResult = await gerarResumosIA(extractedData, supabaseAdmin, jobId, userId, timings.total.start);
```

### Operacao C — Reduzir SUMMARY_TIMEOUT_MS de 120s para 90s

O timeout de 120s e muito generoso para resumos individuais. Modelos que levam >90s para um unico resumo provavelmente vao estourar o orcamento total. Reduzir para 90s da mais folga ao orcamento:

```typescript
const SUMMARY_TIMEOUT_MS = 90000; // 90 seconds
```

### Operacao D — Indicador de fallback durante processamento (Backend)

Atualizar `current_step` no `processar-autos` quando o fallback do Mistral OCR assume, para que o `check-import-status` detecte:

No bloco `catch (mistralError)` (linha 2192-2209), adicionar:

```typescript
await supabaseAdmin.from('import_jobs').update({ 
  current_step: 'Mistral OCR falhou, usando Gemini como fallback...',
  updated_at: new Date().toISOString()
}).eq('id', jobId);
```

### Operacao E — Indicador de fallback durante processamento (Frontend)

No `ImportarAutosDialog.tsx`, na area dos badges (linhas 1966-1988), adicionar deteccao de fallback baseada no texto do `analysisStep`:

```tsx
{/* Fallback Indicator - Shown when OCR provider falls back */}
{analysisStep && (
  analysisStep.toLowerCase().includes('fallback') || 
  analysisStep.toLowerCase().includes('falhou')
) && (
  <Badge 
    variant="outline" 
    className="mt-2 text-xs flex items-center gap-1.5 border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400"
  >
    <RefreshCw className="h-3 w-3" />
    IA de fallback assumiu
  </Badge>
)}
```

Isso usa o mesmo padrao estetico ja existente (Badge outline com icone) e a mesma localizacao na linha do provider indicator. Nenhuma nova variavel de estado necessaria — detecta pelo texto do `analysisStep` que vem do `current_step` do backend.

---

## Escopo Final

| Arquivo | Mudancas |
|---|---|
| `supabase/functions/processar-autos/index.ts` | +heartbeat durante resumos, +orcamento de tempo com `functionStartTime`, timeout 120s para 90s, +current_step no fallback do Mistral |
| `src/components/tools/ImportarAutosDialog.tsx` | +Badge de fallback indicator durante processamento |

### O que NAO sera alterado
- Zero alteracoes no `check-import-status` (a deteccao de fallback ja funciona pelo texto)
- Zero alteracoes no fluxo de OCR do Mistral (o bug de escopo ja foi corrigido)
- Zero alteracoes nos prompts de resumo
- Zero migracoes de banco
- Nenhuma dependencia nova

### Impacto esperado
- Jobs com modelos lentos (gemini-3.1-pro, glm-5) passarao a completar em vez de travar, pois:
  - O heartbeat impede deteccao falsa de "stale"
  - O orcamento de tempo pula resumos extras quando o tempo esta acabando (melhor ter 4/6 resumos do que 0/6)
  - O timeout reduzido para 90s evita que um unico resumo consuma tempo demais
- O usuario vera um badge quando a IA de fallback assumir, dando visibilidade total ao processo

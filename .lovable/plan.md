## Diagnóstico

**O aviso é um falso positivo causado diretamente pela última alteração aprovada** (refactor "AI Bias" + Referências on-demand). Não há bug de extração — o PDF foi processado com sucesso.

### Evidência nos logs (job 097cf10b)

```
[processar-autos] Job ... completed successfully
[gerarResumosIA] Successfully generated resumo_peticao
[gerarResumosIA] Successfully generated resumo_contestacao
[gerarResumosIA] Pulando descricao_doencas - dados insuficientes
[gerarResumosIA] Pulando nexo_causal - dados insuficientes
[gerarResumosIA] Pulando incapacidade - dados insuficientes
[gerarResumosIA] Pulando conclusao - dados insuficientes
[gerarResumosIA] Pulando destino_sugerido - dados insuficientes
[gerarResumosIA] Pulando quesitos_* - dados insuficientes
[gerarResumosIA] Pulando referencias_bibliograficas - dados insuficientes
```

O backend (`processar-autos/index.ts` linhas 1316-1335) agora marca **9 dos 11 itens** com `shouldGenerate: false` — exatamente como planejado e aprovado:
- 5 itens da refatoração AI Bias (descricao_doencas, nexo_causal, incapacidade, conclusao, destino_sugerido) → on-demand via `gerar-justificativa-medica`
- 3 quesitos → on-demand via `gerar-quesitos`
- referencias_bibliograficas → on-demand (mudança da última iteração)

Sobram **apenas 2 resumos auto-gerados**: `resumo_peticao` e `resumo_contestacao`. Ambos rodaram com sucesso.

### A causa do alerta

O frontend em `src/components/tools/ImportarAutosDialog.tsx` ainda usa **constantes hardcoded antigas** (de quando 5 resumos eram gerados automaticamente):

- Linha **1407-1410**: `isIncompleteExtraction = aiUsage.summaries.count < 3` → como agora só 2 são gerados, **sempre dispara**.
- Linha **1439-1442**: `Apenas {count} de 5 resumos foram gerados` → texto e total errados.
- Linha **1535-1542**: indicador verde só ≥3 → sempre amarelo.

A mensagem "Tentar novamente" induz o médico a reprocessar à toa, gastando IA e tempo.

## Correção (escopo cirúrgico — só frontend)

Atualizar 3 trechos em `src/components/tools/ImportarAutosDialog.tsx` para refletir a nova arquitetura on-demand. Nada no backend, edge functions, DB ou OCR é tocado.

### 1. Novo limiar e total dinâmico

No topo de `renderPreview` (linhas 1400-1410):

```ts
// Após a refatoração AI Bias, apenas 2 resumos são auto-gerados durante o import:
// resumo_peticao e resumo_contestacao. Os demais campos (justificativas, conclusão,
// destino, quesitos, referências) são gerados sob demanda pelo médico no editor.
const EXPECTED_AUTO_SUMMARIES = 2;

const isIncompleteExtraction = aiUsage && (
  aiUsage.summaries.provider === 'none' ||
  aiUsage.summaries.count === 0
);
```

Mudança: deixa de marcar parcial quando 1+ resumo foi gerado. Só alerta se zero ou provider inválido (falha real).

### 2. Texto do alerta (linhas 1439-1443)

```tsx
{aiUsage && aiUsage.summaries.count < EXPECTED_AUTO_SUMMARIES && (
  <span className="block mt-1 font-medium">
    Apenas {aiUsage.summaries.count} de {EXPECTED_AUTO_SUMMARIES} resumos automáticos foram gerados.
    Os demais campos são preenchidos sob demanda no editor.
  </span>
)}
```

### 3. Indicador de status (linhas 1532-1548)

```tsx
{aiUsage.summaries.count > 0 ? (
  <div className={cn(
    "text-xs flex items-center gap-1 mt-1",
    aiUsage.summaries.count >= EXPECTED_AUTO_SUMMARIES ? "text-green-500" : "text-yellow-500"
  )}>
    {aiUsage.summaries.count >= EXPECTED_AUTO_SUMMARIES ? (
      <CheckCircle2 className="h-3 w-3" />
    ) : (
      <AlertTriangle className="h-3 w-3" />
    )}
    {aiUsage.summaries.count} de {EXPECTED_AUTO_SUMMARIES} resumos automáticos
  </div>
) : (
  <div className="text-xs text-yellow-500 flex items-center gap-1 mt-1">
    <AlertTriangle className="h-3 w-3" />
    Nenhum resumo gerado
  </div>
)}
```

## Não tocar

- `processar-autos/index.ts` — comportamento correto (já loga "Processamento parcial: X/Y" usando `summariesToGenerate.filter(s => s.shouldGenerate).length` dinâmico na linha 1535).
- `gerar-justificativa-medica`, `gerar-resumos`, `gerar-quesitos` — intactos.
- OCR, splitter, fallbacks, RLS — intactos.
- DB, prompts, seed-prompts — intactos.

## Validação pós-aplicação

Reimportar o mesmo PDF e confirmar:
1. Banner "Extração parcial" **não aparece** quando `count = 2`.
2. Indicador fica verde com "2 de 2 resumos automáticos".
3. Se algum dia `count = 0` (falha real), o aviso volta a aparecer corretamente.

## Risco

Mínimo. Mudança apenas em apresentação (texto, ícone, cor) de um dialog. Sem alteração de fluxo de dados, persistência ou IA.

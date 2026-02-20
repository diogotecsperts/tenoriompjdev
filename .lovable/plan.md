
# Plano — Salvamento Progressivo e Liberacao de Memoria

## Diagnostico Completo das 6 Etapas

O job `abcb0e46` com gemini-3.1-pro completou 5/6 resumos com sucesso, mas a funcao crashou no 6o (referencias_bibliograficas). O heartbeat da correcao anterior resolveu o travamento em "incapacidade" — agora o problema se moveu para a proxima etapa.

### Causa raiz: crash abrupto do runtime

A funcao morreu ~400s apos iniciar, durante a chamada AI para `referencias_bibliograficas`. Evidencias:
- Ultimo heartbeat: 22:27:42 (proximo deveria ser 22:27:54, mas nunca veio)
- Nenhum `ai_usage_log` para `referencias_bibliograficas` (callAI nunca completou)
- O bloco `catch` da funcao NAO executou (job ficou como "processing")
- O bloco `finally` tambem NAO executou

Quando o runtime Deno mata o processo (OOM ou instabilidade), NENHUM handler JavaScript executa. O job fica como zumbi em "processing" para sempre.

### 3 problemas identificados

1. **Memoria nao liberada**: `visionResult` (texto OCR completo, potencialmente centenas de KB) permanece em memoria durante todos os 6 resumos. Junto com `extractedData`, 5 respostas AI acumuladas, e o prompt do 6o resumo, isso pode exceder os 150MB do edge runtime.

2. **Resultado perdido completamente**: Os 5 resumos gerados com sucesso (resumo_peticao, resumo_contestacao, descricao_doencas, nexo_causal, incapacidade) sao armazenados em uma variavel local `results`. Se a funcao morre antes de salvar no banco, TUDO e perdido.

3. **Job zumbi**: Quando o runtime mata a funcao, o job permanece como "processing" indefinidamente. O frontend detecta "stale" apos 5 minutos, mas nao tem dados parciais para oferecer ao usuario.

---

## Operacoes de Implementacao

### Operacao A — Liberar memoria antes dos resumos

Em `supabase/functions/processar-autos/index.ts`, apos a extracao de dados (linha ~2598, antes de iniciar os resumos), liberar objetos grandes que nao sao mais necessarios:

**Fluxo normal (processarPDFBackground):**
Apos `extractedData = ensureValidStructure(parsed)` (linha 2591), adicionar:

```typescript
// MEMORY: Free large objects no longer needed for summary generation
// visionResult holds the full OCR/extraction text - can be very large
// @ts-ignore - intentional null assignment for memory relief
visionResult = null;
parsed = null;
console.log('[processar-autos] MEMORY: Freed visionResult and parsed data before summaries');
```

Nota: `visionResult` e declarado com `let` e pode ser reatribuido. `parsed` e `const` no escopo atual, entao usaremos a anotacao `@ts-ignore` ou reestruturaremos o codigo para `let`.

### Operacao B — Salvamento progressivo de resumos

Na funcao `gerarResumosIA`, apos cada resumo ser gerado com sucesso, salvar os resultados parciais no campo `result` do `import_jobs`. Isso garante que mesmo que a funcao morra, os resumos ja gerados estao persistidos no banco.

Apos a linha 1156 (`summariesGenerated++`), adicionar:

```typescript
// PROGRESSIVE SAVE: Persist partial results after each successful summary
// If the function crashes on the next summary, these results are preserved
try {
  await supabaseAdmin
    .from('import_jobs')
    .update({ 
      result: { 
        partial: true, 
        resumos_parciais: { ...results },
        summariesGenerated,
        lastCompletedSummary: tipo,
        updatedAt: new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', jobId);
  console.log(`[gerarResumosIA] Progressive save: ${summariesGenerated} summaries saved after ${tipo}`);
} catch (saveError) {
  console.warn(`[gerarResumosIA] Failed to save partial results:`, saveError);
}
```

### Operacao C — Recuperar resultados parciais no frontend

No `ImportarAutosDialog.tsx`, quando o frontend detecta um job stale (5+ minutos sem atualizacao), verificar se o job tem resultados parciais no campo `result` e oferecer ao usuario a opcao de usar esses dados.

Na funcao `checkJobStatus`, apos detectar o job como stale, buscar os dados do job e verificar se tem `result.partial === true`:

```typescript
// When stale is detected, check for partial results
if (staleCheckCountRef.current >= STALE_THRESHOLD_POLLS && !isJobStale) {
  console.warn('[ImportarAutosDialog] Job appears stale - checking for partial results');
  setIsJobStale(true);
  
  // Check if the job has partial results we can recover
  if (data.result && data.result.partial) {
    setPartialResults(data.result);
  }
}
```

No alert de stale job, adicionar botao "Usar resultados parciais" quando existirem:

```tsx
{partialResults && (
  <Button 
    variant="outline" 
    size="sm"
    onClick={() => handleUsePartialResults(partialResults)}
    className="text-xs bg-green-500/10 border-green-500/30 text-green-600"
  >
    Usar {partialResults.summariesGenerated} resumos gerados
  </Button>
)}
```

### Operacao D — Alterar ordem dos resumos para priorizar os mais importantes

Reordenar `summariesToGenerate` para que os resumos mais criticos sejam gerados primeiro. Se a funcao morrer, os menos importantes sao perdidos:

```typescript
const summariesToGenerate = [
  // PRIORIDADE 1: Resumos tecnico-cientificos (mais importantes)
  { tipo: 'descricao_doencas', ... progress: 50 },
  { tipo: 'nexo_causal', ... progress: 60 },
  { tipo: 'incapacidade', ... progress: 70 },
  // PRIORIDADE 2: Resumos dos autos
  { tipo: 'resumo_peticao', ... progress: 80 },
  { tipo: 'resumo_contestacao', ... progress: 85 },
  // PRIORIDADE 3: Menos critico (tem valor default no banco)
  { tipo: 'referencias_bibliograficas', ... progress: 92 }
];
```

As referencias bibliograficas ficam por ultimo pois o banco ja tem um valor default para esse campo. Se a funcao morrer antes de gera-las, o laudo ainda fica funcional.

### Operacao E — Liberar memoria no fluxo chunked

A mesma liberacao de memoria da Operacao A, aplicada ao fluxo `processarChunkedPDFBackground`. Localizar o ponto equivalente apos a extracao de dados e antes do inicio dos resumos, e adicionar:

```typescript
// MEMORY: Free large objects no longer needed
extractedContentText = null;
console.log('[processar-autos] MEMORY: Freed extracted content text before summaries (chunked)');
```

---

## Escopo Final

| Arquivo | Mudancas |
|---|---|
| `supabase/functions/processar-autos/index.ts` | Liberacao de memoria (visionResult, parsed, extractedContentText), salvamento progressivo apos cada resumo, reordenacao de prioridade dos resumos |
| `src/components/tools/ImportarAutosDialog.tsx` | Recuperacao de resultados parciais quando job detectado como stale |

### O que NAO sera alterado
- Zero alteracoes nos prompts de IA
- Zero alteracoes no `check-import-status`
- Zero alteracoes no fluxo de OCR (Mistral/Gemini)
- Zero migracoes de banco (o campo `result` ja e jsonb)
- Nenhuma dependencia nova

### Impacto esperado

1. **Liberacao de memoria**: Reduz pressao de RAM durante os resumos, diminuindo chance de OOM crash
2. **Salvamento progressivo**: Mesmo que a funcao morra no resumo 6/6, os 5 anteriores estao salvos no banco e podem ser recuperados
3. **Recuperacao no frontend**: O usuario pode usar os dados parciais em vez de perder tudo e ter que reimportar
4. **Prioridade otimizada**: Se o tempo ou memoria acabar, os resumos menos criticos (referencias) sao os que ficam de fora — o laudo permanece funcional

### Fluxo pos-correcao (cenario de crash)

```
Funcao inicia → OCR completa → memoria liberada →
descricao_doencas ✓ (salvo) → nexo_causal ✓ (salvo) → incapacidade ✓ (salvo) →
resumo_peticao ✓ (salvo) → resumo_contestacao ✓ (salvo) →
referencias_bibliograficas → CRASH →
Frontend detecta stale → "5 de 6 resumos disponíveis" → Usuario usa dados parciais
```



# Plano — Retry automatico em timeout de resumos individuais

## Diagnostico

O timeout de 90s para cada resumo individual e adequado para Gemini (que responde em 20-45s), mas insuficiente para provedores mais lentos como GLM-5 via OpenRouter, que frequentemente ultrapassa esse limite em resumos complexos como `descricao_doencas`.

O sistema atual trata o timeout como erro final — registra o erro e pula para o proximo resumo. O campo fica vazio e o usuario precisa usar "Regerar" manualmente.

## Solucao: Retry com timeout estendido

Quando um resumo falhar por timeout, fazer **1 retry automatico com timeout dobrado (180s)** antes de desistir. Isso cobre a maioria dos casos de lentidao sem arriscar o orcamento de tempo total da funcao.

## Operacao unica

Em `supabase/functions/processar-autos/index.ts`, no bloco `catch` do loop de resumos (linha 1180), adicionar logica de retry para erros de timeout:

**Antes (linhas 1180-1191):**
```typescript
} catch (error) {
  const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
  console.error(`[gerarResumosIA] Error generating ${tipo}:`, error);
  summaryErrors.push(`${tipo}: ${errorMsg}`);
  await logError('processar-autos', `Falha ao gerar ${tipo}: ${errorMsg}`, jobId, { ... });
}
```

**Depois:**
```typescript
} catch (error) {
  const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
  const isTimeout = errorMsg.includes('Timeout');
  
  // Retry once with extended timeout for timeout errors
  if (isTimeout) {
    console.warn(`[gerarResumosIA] Timeout on ${tipo}, retrying with extended timeout (180s)...`);
    await supabaseAdmin
      .from('import_jobs')
      .update({ 
        current_step: `Tentando novamente ${tipo} (timeout)...`,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);
    
    try {
      const retryPrompt = await getPromptForType(tipo, contexto);
      const retryTimeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Retry timeout após 180s`)), 180_000);
      });
      const retryResult = await Promise.race([
        callAI(aiConfig, summarySystemPrompt, retryPrompt, {
          promptType: tipo, userId
        }),
        retryTimeout
      ]);
      
      console.log(`[gerarResumosIA] Retry succeeded for ${tipo}`);
      if (tipo in results) {
        (results as any)[tipo] = retryResult.text;
        summariesGenerated++;
        // Progressive save after retry success
        try {
          await supabaseAdmin.from('import_jobs').update({ 
            result: { partial: true, resumos_parciais: { ...results }, summariesGenerated, lastCompletedSummary: tipo, updatedAt: new Date().toISOString() },
            updated_at: new Date().toISOString()
          }).eq('id', jobId);
        } catch {}
      }
    } catch (retryError) {
      const retryMsg = retryError instanceof Error ? retryError.message : 'Erro no retry';
      console.error(`[gerarResumosIA] Retry also failed for ${tipo}:`, retryMsg);
      summaryErrors.push(`${tipo}: ${errorMsg} (retry: ${retryMsg})`);
      await logError('processar-autos', `Falha ao gerar ${tipo}: ${errorMsg} (retry falhou)`, jobId, { tipo, provider: aiConfig.provider, model: aiConfig.model });
    }
  } else {
    console.error(`[gerarResumosIA] Error generating ${tipo}:`, error);
    summaryErrors.push(`${tipo}: ${errorMsg}`);
    await logError('processar-autos', `Falha ao gerar ${tipo}: ${errorMsg}`, jobId, { tipo, provider: aiConfig.provider, model: aiConfig.model });
  }
}
```

A logica de **orcamento de tempo** existente (linhas 1106-1121) ja protege contra estourar o wall_clock_limit — se o retry consumir muito tempo, os resumos seguintes serao pulados graciosamente.

## Escopo

| Arquivo | Mudanca |
|---|---|
| `supabase/functions/processar-autos/index.ts` | Adicionar retry com timeout de 180s no catch de timeout de resumos |

### Resultado esperado

- GLM-5 timeout no 1o attempt (90s) → retry automatico com 180s → sucesso na maioria dos casos
- Se o retry tambem falhar, o erro e registrado e o fluxo continua normalmente
- O orcamento de tempo da funcao (600s) continua protegido pelo check existente
- Zero impacto no fluxo com Gemini (que raramente atinge 90s)


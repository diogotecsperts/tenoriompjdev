## Diagnóstico

Você não precisava mudar nada no DevPanel se o OCR já estava configurado como MiniMax. O próprio log confirma isso: `provider=minimax`.

O erro continuou porque o backend fez isto:

```text
MiniMax selecionado
→ detectou que MiniMax precisa rasterizar no navegador
→ tratou isso como “falha”
→ caiu em fallback para Gemini dentro da função
→ Gemini tentou processar o PDF grande na função
→ WORKER_RESOURCE_LIMIT / 546
```

Ou seja: a estratégia nova está parcialmente implementada, mas o roteador de OCR ainda está engolindo o sinal especial do MiniMax e fazendo fallback para Gemini, exatamente o caminho que queríamos evitar.

## Plano de correção

1. **Corrigir o roteador de OCR**
   - Quando o provider configurado for `minimax`, não tratar o erro `MINIMAX_OCR_REQUIRES_CLIENT_RASTERIZE` como falha comum.
   - Propagar imediatamente esse sinal para `prev-pre-processar`.
   - Isso impede fallback para Gemini/Mistral quando o usuário escolheu MiniMax.

2. **Ajustar `prev-pre-processar` para sinalizar o frontend sem virar runtime error**
   - Quando receber o sinal de rasterização client-side, retornar uma resposta controlada com:
     - `needsClientRasterize: true`
     - `pdfPath`
     - `bucket`
     - `chunkEndpoint`
   - Preferencialmente retornar isso como resposta normal, não como erro HTTP, para o `supabase.functions.invoke()` não transformar o fluxo esperado em erro.

3. **Fortalecer o frontend previdenciário**
   - Em `preProcessarPericia`, detectar `needsClientRasterize` tanto em resposta normal quanto, defensivamente, em corpo de erro antigo.
   - Baixar o PDF do storage.
   - Rodar `runMinimaxClientOcr()` no navegador.
   - Reinvocar `prev-pre-processar` com `preExtractedText`.

4. **Melhorar mensagem para o usuário durante o processamento**
   - Garantir que o progresso mostre fases tipo:
     - rasterizando páginas
     - extraindo chunks MiniMax
     - consolidando extração
   - Assim o usuário entende que PDF grande pode demorar, mas não travou.

5. **Validar com logs**
   - Confirmar que o novo caminho esperado fica assim:

```text
prev-pre-processar: provider=minimax
prev-pre-processar: needsClientRasterize=true
frontend: rasterizando PDF
minimax-ocr-chunk: chunks 1..N
prev-pre-processar: usando texto pré-extraído
prev-pre-processar: extração estruturada concluída
```

## Resultado esperado

- Nenhuma alteração necessária no DevPanel além de manter OCR = MiniMax.
- PDFs grandes do Previdenciário deixam de cair no processamento pesado dentro da função.
- O erro `WORKER_RESOURCE_LIMIT` deve parar para esse fluxo MiniMax.
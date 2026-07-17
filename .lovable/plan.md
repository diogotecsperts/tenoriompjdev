## Plano: depurar e tornar o GLM do Trabalhista observável e finito

### Objetivo
Eliminar a espera infinita em “Extração de dados (Vision)” quando o OCR principal é GLM, sem alterar o fluxo da Mistral, sem mexer no Previdenciário e sem mudar a lógica pós-OCR do Trabalhista.

### O que encontrei
- O Trabalhista já tem raster/split client-side para GLM, mas a telemetria ainda é insuficiente após o envio das partes.
- O backend atualiza `updated_at` por heartbeat, então o alerta de “sem update” pode não disparar mesmo se o GLM estiver preso dentro da chamada OCR.
- O `check-import-status` não reconhece GLM como provider quando o passo diz “Extraindo parte...”; isso pode deixar a UI sem contexto correto.
- O relatório de diagnóstico ainda não existe.

### Mudanças propostas

1. **Criar estado dinâmico só para GLM no Trabalhista**
   - Adicionar uma timeline específica para GLM, visível apenas quando `phase1_ocr_provider = glm`.
   - Etapas: `probe`, `raster`, `split`, `upload`, `job_start`, `ocr_part`, `backend_processing`.
   - Mostrar etapa atual, tempo decorrido da etapa, progresso quando disponível e estimativa simples quando houver total de páginas/partes.

2. **Tornar o travamento detectável mesmo com heartbeat**
   - Além de observar `updated_at`, comparar também `current_step`, `progress` e `step_id`.
   - Se `updated_at` muda mas `current_step/progress` ficam iguais por tempo demais, tratar como “sem avanço real”.
   - Para GLM, usar limites mais curtos por fase:
     - raster client-side: até 8 min;
     - split client-side: até 3 min;
     - upload de cada parte: erro claro se falhar;
     - OCR de uma mesma parte sem avanço real: alerta em ~4–5 min e aborto controlado após uma extensão única.
   - Isso evita aguardar 15+ minutos sem informação útil.

3. **Melhorar backend do chunked GLM sem tocar Mistral**
   - No `processar-autos`, durante `processarChunkedPDFBackground`, registrar logs estruturados antes/depois de cada parte GLM.
   - Passar `onHeartbeat` ao `runOcrWithConfiguredProvider` para atualizar `current_step` com mensagens como:
     - `GLM-OCR: preparando parte 1/2...`
     - `GLM-OCR: aguardando OCR da parte 1/2...`
     - `GLM-OCR: parte 1/2 concluída...`
   - Preservar Mistral: nenhum raster/split novo, nenhum comportamento novo fora do branch GLM; Mistral continua usando o caminho original via router.

4. **Corrigir identificação do provider no status**
   - Atualizar `check-import-status` para detectar `glm` em passos contendo `glm`, `z.ai` ou quando o job chunked tiver metadado do provider.
   - Assim a UI mostra o painel GLM correto e não cai em mensagem genérica.

5. **Adicionar botão “Baixar diagnóstico” só no GLM**
   - Gerar um `.txt` local no navegador com:
     - job id;
     - provider OCR ativo;
     - arquivo original e tamanho;
     - etapas GLM registradas com horário/duração;
     - partes geradas, páginas e tamanho;
     - último `current_step`, `progress`, `step_id`;
     - últimos logs de backend já disponíveis no modal;
     - motivo de alerta/trava/abort quando existir.
   - O botão aparece durante processamento GLM e em alerta/erro de trava.

6. **Mensagens de erro mais objetivas**
   - Trocar erro genérico por mensagens com causa provável e último ponto observado:
     - “GLM parou na parte 1/2 após X min sem avanço real.”
     - “Último sinal do servidor: ...”
     - “Ação recomendada: tentar Mistral como backup ou reduzir PDF.”

7. **Garantias de isolamento**
   - Não alterar Previdenciário.
   - Não alterar prompts, campos, `laudo-structure`, criação de laudo ou fluxo pós-OCR.
   - Não padronizar split para todos os providers.
   - Não alterar o caminho Mistral, exceto se for necessário apenas para não afetá-lo por condicionais explícitas.

### Validação
- Conferir typecheck automático do projeto.
- Verificar no código que o painel/diagnóstico só aparece para GLM.
- Confirmar que Mistral continua usando o fluxo original do router, sem rasterização/split GLM.
- Simular mentalmente os pontos de trava: probe, raster, split, upload, início do job, OCR parte N, estruturação pós-OCR.
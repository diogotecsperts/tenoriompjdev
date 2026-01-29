
Objetivo
- Eliminar o “Failed to fetch” na importação 1 etapa com PDF ~68MB, garantindo que:
  1) o backend não estoure memória (sem converter stream → bytes para arquivos grandes)
  2) o status do job continue “vivo” (updated_at atualizando) para não ficar “travado” no modal
  3) o frontend não derrube o fluxo por falha transitória de rede (polling resiliente, sem fechar/zerar o modal)

Diagnóstico (com base no projeto atual)
- A configuração atual do sistema está assim (backend):
  - import_strategy = single_pass
  - pdf_ai_provider = mistral-ocr
  - pdf_fallback_provider = gemini
  - max_pdf_size_mb = 100
- Para PDFs >20MB, o `processar-autos` baixa via streaming (`fileData.stream()`), porém:
  - No caminho do Mistral (single-pass), o código converte stream inteiro em bytes (`chunks[]` → `Uint8Array(total)`), o que para 68MB pode exceder o limite de memória do worker.
  - Mesmo quando há fallback para Gemini Files API, o caminho atual já “morreu” antes por ter tentado materializar o PDF inteiro em memória.
- No frontend, o polling (`checkJobStatus`) usa `fetch` direto e, ao receber `TypeError: Failed to fetch`, encerra o polling e reseta estado para “idle”, gerando a percepção de “parou no meio/sem feedback”.

Plano de implementação

1) Backend (função processar-autos): nunca converter stream→bytes para arquivo grande quando o provider configurado é Mistral
Arquivos:
- supabase/functions/processar-autos/index.ts

Mudanças:
1.1) Corrigir shadowing/redeclaração de variável `pdfStream`
- Hoje existe `let pdfStream` no escopo da função e outro `let pdfStream` dentro do try (shadowing).
- Ajustar para existir apenas 1 `pdfStream` no escopo do `processarPDFBackground`, evitando comportamento confuso e garantindo que as checagens posteriores (`if (pdfStream)`) sempre reflitam o stream real.

1.2) “Short-circuit” no caminho do Mistral em single-pass quando o arquivo for grande
- Antes de qualquer “converter stream para bytes” no bloco `if (pdfProvider === 'mistral-ocr')`:
  - Se `pdfSizeBytes > SAFE_MEMORY_SPLIT_LIMIT` (45MB) e existe `pdfStream`, então:
    - NÃO tentar Mistral
    - Registrar log/atualizar `import_jobs.current_step` informando que o PDF é grande e será processado via Gemini streaming
    - Deixar `extractedData` continuar vazio e cair no “Original flow” (que já tem tratamento de “large PDF streaming” via `extractVisualContent({stream,size})`).

Motivo:
- Mistral exige bytes, mas bytes de 68MB + overhead + buffers costuma estourar memória.
- O fluxo “Original flow” já suporta streaming para Gemini sem carregar o PDF inteiro em RAM.

1.3) Mesmo ajuste para Two-Phase (proteção adicional)
- No two-phase, se algum dia `phase1_ocr_provider` virar `mistral` e o arquivo for >45MB, aplicar a mesma regra: forçar Gemini streaming (ou abortar com mensagem clara).
- Isso evita regressões futuras quando trocarem configuração no DevPanel.

1.4) Heartbeat de job para evitar “travado” no modal
- Problema observado: o job pode ficar vários minutos com `updated_at` sem mudar enquanto está em chamadas externas longas (upload/processing).
- Implementar um “heartbeat” leve durante as fases longas (principalmente extração via Gemini Files API):
  - iniciar um `setInterval` (ex.: a cada 10–15s) que faz `update` em `import_jobs.updated_at` (e opcionalmente mantém `progress` e `current_step` iguais)
  - parar o interval no `finally` após concluir/falhar.
- Benefício: o frontend não marca stale e o usuário percebe que o processo está vivo.

2) Frontend (ImportarAutosDialog): polling resiliente e sem “resetar tudo” em falha transitória
Arquivos:
- src/components/tools/ImportarAutosDialog.tsx

Mudanças:
2.1) Trocar chamadas `fetch` diretas por `supabase.functions.invoke`
Pontos:
- `processar-autos` (início do processamento)
- `check-import-status` (polling)
Benefícios:
- Simplifica headers/auth (menos chance de erro por token/headers)
- Evita dependência de `import.meta.env.VITE_SUPABASE_URL` para chamadas de função
- Permite tratar `error` de forma consistente (`{ data, error }`)

2.2) Retentativa e tolerância a “Failed to fetch” no polling
- Hoje: qualquer erro no polling encerra o intervalo e volta para `idle`.
- Novo comportamento:
  - Manter um contador de falhas consecutivas (ref) no polling.
  - Se erro for de rede (`TypeError: Failed to fetch`):
    - não encerrar o polling imediatamente
    - exibir aviso não destrutivo (ex.: “Conexão instável, tentando reconectar…”) e continuar tentando
    - só abortar e mostrar erro final se exceder um limite (ex.: 10 falhas consecutivas = ~30s)
  - Se erro for “real” do backend (status `failed` retornado pelo job), aí sim encerrar e mostrar a mensagem.

2.3) Melhorar a mensagem de “stale job”
- Já existe detecção de stale por `updatedAt`.
- Com o heartbeat do backend, isso deve diminuir bastante; mas manter:
  - quando stale disparar, mostrar CTA claro: “Recarregar status”, “Tentar novamente (reprocessar)”, e instrução objetiva (ex.: “PDF muito grande pode exigir divisão manual se exceder X MB”).
- Ajustar também o texto do console “no updates for 60+ seconds” (comentário está inconsistente com 100 polls * 3s = 5 min).

3) Validação / Testes (end-to-end)
Cenários obrigatórios:
- Importação 1 etapa com PDF ~68MB (o caso reportado)
  - Deve: não crashar, não fechar modal, não virar idle, não dar “Failed to fetch”
  - Deve: atualizar status com frequência (updated_at mudando), e completar ou falhar com mensagem clara
- Importação 1 etapa com PDF pequeno (<20MB)
  - Deve: continuar funcionando como antes
- Importação 1 etapa com PDF entre 20–45MB com provider Mistral
  - Deve: continuar usando Mistral (se for desejado) ou, caso fique instável, avaliar reduzir limite prático do Mistral (opcional)
- Simular instabilidade (ex.: recarregar aba durante polling / oscilar conexão)
  - Deve: manter o job rodando e retomar polling sem “resetar” tudo por erro transitório

Riscos e mitigação
- Mais writes no banco por heartbeat:
  - Mitigar com intervalo maior (10–15s) e apenas enquanto estiver em passos longos.
- PDFs próximos de 45–50MB ainda podem ser pesados para Mistral:
  - Este plano foca no bug de 68MB; se ainda houver OOM em ~49MB, podemos endurecer a regra para também pular Mistral acima de um limite menor (ex.: 35–40MB), mantendo a preferência por Gemini streaming.

Entregáveis (o que será alterado)
- supabase/functions/processar-autos/index.ts
  - remover shadowing de `pdfStream`
  - pular Mistral automaticamente para PDFs >45MB (sem converter stream em bytes)
  - adicionar heartbeat de atualização em `import_jobs`
- src/components/tools/ImportarAutosDialog.tsx
  - trocar `fetch` por `supabase.functions.invoke` em `processar-autos` e `check-import-status`
  - tornar polling resiliente a falhas transitórias (“Failed to fetch”), sem resetar o modal para idle
  - pequenos ajustes na UX de stale job

Critério de sucesso
- Importação de 68MB não gera “Failed to fetch” e não “morre no meio”.
- Se algo falhar, o usuário vê feedback claro e o modal permanece informativo (sem fechar/zerar sozinho).

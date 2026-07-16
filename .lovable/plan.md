
## Diagnóstico

Erro no cliente: `Edge Function returned a non-2xx status code` ao clicar em **Gerar Referências** (aba Referências Bibliográficas, Trabalhista).

O que os artefatos mostram:

- Frontend (`src/components/laudo/sections/ReferenciasBibliograficas.tsx`) está correto: envia `{ laudoId, campo: 'referencias' }` para a edge function `gerar-justificativa-medica`, valida CIDs/Conclusão antes e trata erros.
- A edge `gerar-justificativa-medica` suporta `campo: 'referencias'` (prompt `prompt_gen_referencias_demanda`, seção `conclusao/referencias`) e usa `getAIConfig()` + `callAI()` — respeita DevPanel (nossa correção anterior sobre downgrades foi em `processar-autos`, não afeta este arquivo).
- Logs da edge (últimos 15 min): boots normais, `gen_nexo_causal` (20s), `gen_incapacidade` (6s) e `gen_destino` (1.7s) todos SUCCESS via MiniMax-M3. Nenhum `[AI Usage Log] gen_referencias`, nenhum `[prompt-manager] Prompt carregado ... prompt_gen_referencias_demanda`, nenhum erro visível — apenas rajadas de `shutdown` logo após o clique.
- O prompt de referências (linhas 227-251) pede 5-8 referências ABNT completas com autor/título/editora/ano/DOI. Isso pode gerar tokens de saída muito longos e, com MiniMax-M3 (mais lento em respostas grandes) sem `maxOutputTokens` nem `requestTimeoutMs` explícitos, a execução pode ultrapassar o wall-clock da edge — que é morta pelo runtime antes de responder, produzindo o não-2xx no cliente sem registro de erro.
- A correção anterior (`processar-autos` + UI de OCR) **não toca** este caminho: nossa refatoração ficou isolada nos branches de OCR two-phase e single-pass do módulo Trabalhista de importação, e no modal `ImportarAutosDialog`. O gerador de referências continua saudável em termos de código; o problema é ambiental (timeout/token) + falta de instrumentação para diagnosticar.

Não vou tocar em MiniMax, DevPanel, `ai-config.ts` global, nem no módulo Previdenciário.

## Objetivo

1. Fazer com que qualquer falha em `gerar-justificativa-medica` — em especial no campo `referencias` — retorne um erro visível ao invés de o runtime matar a função silenciosamente.
2. Reduzir a probabilidade do timeout, limitando a resposta de referências a um tamanho compatível com o wall-clock da edge, sem mudar o conteúdo do prompt.
3. Preservar a saúde do prompt e do fluxo dos outros campos (`cid_descricao`, `nexo_causal`, `incapacidade`, `conclusao`, `destino`, `prev_*`).

## Alterações

### 1. `supabase/functions/gerar-justificativa-medica/index.ts` — instrumentação + timeout dedicado para `referencias`

- Adicionar logs de trace no início do handler e antes/depois de `getPrompt` e `callAI`, com prefixo `[gerar-justificativa-medica]` e o `campo` recebido — para que qualquer futura falha apareça no log da edge com o passo exato onde parou.
- Adicionar por-campo os parâmetros de chamada de `callAI`:
  - `referencias`: `{ maxOutputTokens: 2200, requestTimeoutMs: 90_000 }` — cabe ~8 referências ABNT longas e força um erro clean se a IA ultrapassar 90s antes do runtime matar a função (~150s).
  - Demais campos: sem alteração (mantêm defaults atuais).
- Envolver `callAI` em try/catch adicional que:
  - loga `err.message` e `err.code` (quando presente do `classifyAIProviderError`);
  - devolve status 502 + `{ error: 'A IA demorou demais ou falhou ao gerar as referências. Tente novamente em instantes.' }` quando o erro for timeout, e status 500 + mensagem original para os demais.
- Nenhuma mudança no texto do prompt, nas variáveis interpoladas, no `FIELD_TO_PROMPT`, nas validações pós-load, no `SYSTEM_PROMPT` nem no `buildContext`.

### 2. Nenhuma outra alteração

- Frontend: nenhum toque (o `extractErrorMessage` já sabe exibir o campo `error` retornado pela edge).
- `ai-config.ts`, `prompt-manager.ts`, DevPanel, DB, `processar-autos`, `prev-*`, `ocr-router`, `glm-ocr`, `config.toml`: intocados.

## Validação

- `tsgo --noEmit` deve passar.
- Reinvocar "Gerar Referências" pelo Trabalhista:
  - Sucesso esperado: texto salvo, toast "Referências geradas com sucesso!", log `[AI Usage Log] gen_referencias - <provider>/<model> - SUCCESS`.
  - Timeout esperado: toast com a mensagem "A IA demorou demais...", log `[gerar-justificativa-medica] callAI falhou em campo=referencias` com o motivo, sem overlay de crash.
- Testar rapidamente um segundo campo (ex.: **Regerar conclusão**) para garantir que os logs extras não quebraram o caminho comum.

## Detalhes técnicos

- O wall-clock efetivo da edge nas invocações recentes do projeto tem ficado abaixo de ~150s; `requestTimeoutMs: 90_000` deixa margem para a função encerrar o `fetch` e responder JSON antes do runtime matar.
- `maxOutputTokens: 2200` é ~1600 palavras em pt-BR — suficiente para 8 referências ABNT detalhadas com DOI. `callAI`/`callProvider` já propagam `maxOutputTokens` para todos os providers (Lovable, Gemini, OpenAI-compatible, Claude, MiniMax) via o parâmetro existente.
- Nenhum cross-provider fallback é introduzido — respeita a regra do DevPanel.

## Diagnóstico

O erro do print continua genérico porque a chamada ao backend está voltando como **504 timeout** depois de ~150s. Nesse caso, o frontend recebe apenas `Edge Function returned a non-2xx status code`, sem o JSON detalhado da função.

Pelos logs, o fluxo foi:

1. OCR Gemini funcionou corretamente via Files API.
2. O PDF tinha 113 páginas e gerou 143.360 caracteres de OCR.
3. A próxima etapa chamou o modelo principal MiniMax M3 com `maxOutputTokens: 32000` em JSON mode.
4. A função ficou presa/longa nessa chamada e a plataforma encerrou a requisição antes de a função conseguir montar uma resposta amigável.

Então o problema atual não parece ser mais OOM no OCR. O gargalo está na **etapa de extração estruturada com IA**, principalmente em documentos grandes usando MiniMax M3.

## Plano de correção pontual

1. **Criar classificação padronizada de erro de IA**
   - Detectar nos erros de provider: timeout/504, quota/saldo/402/429, chave inválida/401/403, payload/modelo inválido/400, resposta truncada e indisponibilidade 5xx.
   - Retornar sempre JSON com `error`, `code`, `stage`, `provider`, `model`, `upstreamStatus` e `technicalDetail` quando houver.
   - Não expor chaves nem dados sensíveis.

2. **Corrigir o 504 que impede mensagem detalhada**
   - Reduzir o risco de timeout da etapa principal em `prev-pre-processar`:
     - aplicar limite de tempo interno por chamada de IA, menor que o timeout da plataforma;
     - se estourar, acionar fallback configurado antes de a função morrer;
     - se fallback também falhar/estourar, retornar erro detalhado controlado.
   - Isso evita cair no erro genérico do cliente.

3. **Ajustar o tamanho da extração previdenciária para documentos grandes**
   - Para PDFs grandes, reduzir de forma mais agressiva o OCR enviado à extração estruturada, preservando início e fim do processo.
   - Manter a regra de não inventar dados e não alterar dados já salvos.
   - Objetivo: evitar timeout em MiniMax M3 sem afetar OCR nem outros módulos.

4. **Melhorar o frontend do toast**
   - Trocar `Erro IA` por mensagens específicas:
     - `Tempo excedido na IA`
     - `Saldo/cota insuficiente`
     - `Credencial da IA inválida`
     - `Modelo indisponível`
     - `Resposta incompleta da IA`
   - Mostrar detalhes úteis: etapa (`OCR` ou `extração`), provider/modelo e status upstream quando disponível.

5. **Preservar auditoria para DevPanel**
   - Garantir que falhas de provider/fallback sejam registradas em `ai_usage_logs` quando possível.
   - Assim o DevPanel consegue mostrar se falhou no app, no provider, por quota, por timeout ou por credencial.

## Arquivos previstos

- `supabase/functions/_shared/ai-config.ts`
- `supabase/functions/prev-pre-processar/index.ts`
- `src/modules/previdenciario/api/processar.ts`
- `src/modules/previdenciario/pages/PautaDetalhe.tsx`

## Validação

- Conferir logs da função para confirmar que o timeout vira erro JSON controlado.
- Verificar que OCR Gemini continua usando Files API para PDFs grandes.
- Testar o fluxo com MiniMax M3 como principal e Gemini como OCR/fallback configurado.
- Confirmar que o usuário vê mensagem detalhada em vez de `Edge Function returned a non-2xx status code`.

Objetivo imediato
- Eliminar o erro recorrente **“Gemini Vision (Streaming) error (400): INVALID_ARGUMENT”** no fluxo de importação (especialmente para PDFs ~68MB), sem quebrar o que já funciona para PDFs pequenos.

Diagnóstico (o que está realmente acontecendo)
- O erro atual **não é mais “Failed to fetch”**: agora o backend chega até “upload streaming complete” e **falha na chamada `generateContent`** do Gemini.
- Pelos logs anteriores, o upload via Files API funciona (arquivo fica `ACTIVE`) e o erro acontece **no payload enviado ao endpoint**:
  `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`
- Hoje o payload do caminho “Files API / Streaming” em `supabase/functions/_shared/pdf-visual-extractor.ts` usa:
  - `parts: [{ text: ... }, { fileData: { fileUri, mimeType } }]`
  - `generationConfig: { temperature, maxOutputTokens }`
- O problema é que, na prática, a API é sensível à **forma exata** do payload para arquivos via Files API:
  - Existem duas convenções em circulação (camelCase vs snake_case) e, dependendo do endpoint/versão/validações, uma pode falhar com `INVALID_ARGUMENT`.
  - Além disso, há variações aceitas para o identificador do arquivo (URI completa vs `files/<id>`).
- Conclusão: em vez de “chutar” camelCase ou snake_case, precisamos tornar o extractor **robusto**: tentar formatos suportados de forma determinística e com logs claros, até um funcionar.

Impacto em PDFs menores (respondendo sua pergunta)
- O fluxo **< 20MB** (que você disse que estava passando) **não usa** `extractVisualContent()`; ele usa `callPDFProvider(...)` no `processar-autos` (linha ~1626 do trecho que vimos).  
  Portanto, **o que vamos ajustar aqui NÃO deve afetar PDFs pequenos (<20MB)**.
- O fluxo **20–45MB** e **>45MB** usa `extractVisualContent({ stream, size })` e portanto **vai ser afetado sim** — mas a intenção é: “afetar para corrigir” (porque hoje esse caminho também está sujeito ao mesmo 400).

Plano de correção (uma vez, do jeito certo)

1) Tornar `pdf-visual-extractor` resiliente a variações de payload do Gemini Files API
Arquivo: `supabase/functions/_shared/pdf-visual-extractor.ts`

1.1) Implementar um helper interno `callGeminiGenerateContentWithFile(...)` com tentativas em cascata
- Criar uma função interna (no mesmo arquivo) que receba:
  - `apiKey`, `apiModel`, `fileUri`, `prompt`
  - e retorne `{ ok, text }` ou lance erro final com detalhes.
- Ela fará tentativas (em ordem) quando receber **400 INVALID_ARGUMENT**:

Tentativa A (padrão “estilo callGeminiVision”)
- `parts`: primeiro o arquivo, depois o texto (igual ao `callGeminiVision` que já funciona bem no projeto):
  - `{ fileData: { fileUri: <uri>, mimeType: 'application/pdf' } }`
  - `{ text: EXTRACTION_PROMPT }`
- `generationConfig`: incluir também `topP` e `responseMimeType: "application/json"` (mesma linha do callGeminiVision), além de `maxOutputTokens`.

Tentativa B (mesmo, mas com “fileUri curto”)
- Se `fileUri` for `https://.../files/abc`, gerar também `files/abc` e tentar:
  - `{ fileData: { fileUri: 'files/abc', mimeType: 'application/pdf' } }`
- Motivo: há cenários em que a API valida o formato do identificador e rejeita a URI completa.

Tentativa C (payload em snake_case apenas para o “part” do arquivo)
- Tentar:
  - `{ file_data: { file_uri: <uri>, mime_type: 'application/pdf' } }`
  - `{ text: ... }`
- (E repetir com `files/abc` se aplicável)
- Motivo: há validações/implementações que só aceitam snake_case no part de arquivo.

Regras de retry (para não virar tentativa infinita)
- Só repetir quando:
  - `response.status === 400` e o body contém `INVALID_ARGUMENT` (ou a mensagem “invalid argument”)
- Para outros erros (401/403/429/5xx), manter o erro “real” (não mascarar).

1.2) Ajustar logging para parar de “voar cego”
- Para cada tentativa, logar:
  - `attemptName` (A/B/C)
  - `apiModel`
  - `fileUri` usado (completo vs curto)
  - `keys do payload` (sem imprimir o PDF, óbvio)
- Em caso de erro, logar o `response.status` e `responseText` completo (isso hoje já existe em parte, mas queremos por tentativa).

1.3) Aplicar o helper nos 3 caminhos que usam Files API
- Substituir o `fetch(...)` duplicado dentro de:
  - `extractWithFilesAPIStream`
  - `extractWithFilesAPIBytes`
  - `extractWithFilesAPI`
- Isso garante consistência e evita “corrigir 1 e esquecer o resto”.

2) Token limit: manter seguro sem quebrar nada
Arquivo: `supabase/functions/_shared/pdf-visual-extractor.ts`

2.1) Não mexer no fluxo <20MB do import (para não “quebrar o que tava passando”)
- O import <20MB usa `callPDFProvider` e não esse arquivo para a etapa principal.
- Então, a correção principal foca no Files API.

2.2) Mesmo assim, evitar futuros 400 “de tokens” onde esse extractor for usado
- Ajustar `extractWithInlineBase64` (que hoje tem `maxOutputTokens: 1048576`) para um valor compatível:
  - Definir `maxOutputTokens` padrão em `65536` (ou `32768`, dependendo do modelo configurado) e, se houver 400, fazer fallback automático para `32768`.
- Observação: isso não deve impactar o import <20MB do seu fluxo atual, mas evita armadilhas em outros pontos do app que possam chamar `extractVisualContent` com base64.

3) Re-deploy do backend functions que carregam o shared module
- Como `pdf-visual-extractor.ts` é usado por `processar-autos`, após a alteração, garantir que a função `processar-autos` seja atualizada junto (para garantir que o bundle inclua o shared atualizado).

4) Validação (end-to-end) com critérios objetivos
4.1) Caso principal (68MB)
- Rodar importação 1 etapa com PDF ~68MB:
  - Confirmar no log:
    - upload streaming completou (já ocorre)
    - `generateContent` tenta A/B/C e **uma delas retorna 200**
  - Confirmar no UI:
    - sai do estado de “analisando”
    - avança para “Estruturando dados extraídos...”
    - termina ou falha com erro “real” (não 400 genérico)

4.2) Regressão (PDF pequeno que estava funcionando)
- Rodar importação com PDF <20MB
  - Confirmar que continua passando (porque não depende desse trecho).
  - Se falhar, o problema é outro ponto e vamos isolar com logs (mas pelo fluxo atual, não deve).

Resultado esperado
- O erro 400 INVALID_ARGUMENT deixa de acontecer porque o backend passa a usar um payload aceito pela API no cenário real (e se a API variar, nosso fallback cobre).
- PDFs pequenos continuam funcionando, pois o fluxo deles não depende do caminho de streaming/Files API.

Arquivos que serão alterados
- `supabase/functions/_shared/pdf-visual-extractor.ts` (principal)
- (Possivelmente nenhum outro, a menos que precisemos expor também o `fileName`/`files/<id>` de forma mais explícita no `gemini-files-api.ts`, mas a preferência é derivar do `fileUri` no próprio extractor para manter mudanças mínimas.)

Observação importante (por que isso “resolve de uma vez”)
- Em vez de “trocar camelCase por snake_case” (que pode estar certo para uma rota e errado para outra), este plano implementa um mecanismo controlado de compatibilidade, com:
  - tentativas finitas,
  - logs por tentativa,
  - e fallback de formato do identificador do arquivo.
Isso reduz o risco de loop infinito de correções e aumenta a previsibilidade.

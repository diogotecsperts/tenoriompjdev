
Contexto (o que esse erro significa)
- O job falhou no `processar-autos` quando a extração “Gemini Vision (Streaming)” tentou chamar `generateContent` passando um arquivo enviado pela Files API.
- A mensagem “Unsupported file URI type: files/o3jngpo0ttcu” indica que o endpoint **não aceita** o formato curto `files/<id>` (nem em camelCase nem snake_case). Ele quer **URI HTTPS completa** do arquivo (ex.: `https://generativelanguage.googleapis.com/.../files/<id>`).

Diagnóstico no código atual (confirmado no arquivo)
- Em `supabase/functions/_shared/pdf-visual-extractor.ts`, o helper `callGeminiGenerateContentWithFile()` deriva `shortFileUri` e tenta, em sequência:
  - A: `fileData` + URI completa
  - B: `fileData` + URI curta `files/<id>`  ❌
  - C: `file_data` + URI completa
  - D: `file_data` + URI curta `files/<id>`  ❌
- O “Last: D-snake_case-shortUri” do seu erro mostra que chegamos justamente numa tentativa **que a API rejeita por definição**.

Objetivo
- Parar de tentar `files/<id>` (curto) e garantir que sempre usamos um `fileUri` válido (HTTPS completo) no `generateContent`.
- Aproveitar para alinhar o `generationConfig` ao padrão que já funciona no projeto (`callGeminiVision`): incluir `responseMimeType: "application/json"` e manter `topP`.

Mudanças propostas (implementação)

1) Corrigir o helper `callGeminiGenerateContentWithFile()` para nunca usar URI curta
Arquivo: `supabase/functions/_shared/pdf-visual-extractor.ts`

1.1 Remover o caminho “shortFileUri”
- Remover a derivação de `shortFileUri` e remover as tentativas:
  - `B-camelCase-shortUri`
  - `D-snake_case-shortUri`
- Motivo: os próprios erros confirmam que esse formato é rejeitado.

1.2 Normalizar URI completa (cobrir variação com/sem `/v1beta`)
- Implementar uma função interna pequena, por exemplo `normalizeGeminiFileUriVariants(fileUri: string): string[]` que retorne uma lista de URIs HTTPS completas para tentar:
  - `fileUri` como veio do upload (ex.: `https://generativelanguage.googleapis.com/v1beta/files/<id>`)
  - variante sem `/v1beta` se aplicável (ex.: `https://generativelanguage.googleapis.com/files/<id>`)
- Motivo: a própria mensagem de erro dá exemplo sem `/v1beta`. Mesmo que a variante com `/v1beta` seja correta, tentar ambas deixa o sistema à prova de inconsistências do backend do provedor.

1.3 Tentar somente payloads “válidos” (sem URI curta), com logs melhores
- Montar tentativas finitas, por exemplo:
  - A1: `fileData` + fileUriVariant1
  - A2: `fileData` + fileUriVariant2
  - C1: `file_data` + fileUriVariant1
  - C2: `file_data` + fileUriVariant2
- Em cada tentativa, logar explicitamente:
  - attempt name
  - `apiModel`
  - `fileUri` usado
  - status e body (limitado) em caso de 400

1.4 Alinhar `generationConfig` com o padrão “que já funciona”
- No `generationConfig` usado para Files API/Streaming, incluir:
  - `topP: 0.95`
  - `maxOutputTokens: 65536` (já está)
  - `responseMimeType: "application/json"`
- Motivo: seu prompt explicitamente pede JSON; isso reduz chance de validação/retorno “fora do esperado”.

2) Garantir que os 3 caminhos (stream/bytes/base64 Files API) usem o helper corrigido
Arquivo: `supabase/functions/_shared/pdf-visual-extractor.ts`
- Verificar que:
  - `extractWithFilesAPIStream`
  - `extractWithFilesAPIBytes`
  - `extractWithFilesAPI`
  já chamam `callGeminiGenerateContentWithFile()` (chamam), então a correção do helper resolve todos os fluxos com arquivos grandes.

3) Atualização do backend function que empacota o shared module
- Após alterar o shared `_shared/pdf-visual-extractor.ts`, atualizar/republicar a função `processar-autos` (é ela que inclui esse módulo no bundle) para garantir que a execução do job use a versão nova.

Validação (passo a passo)
1) Repetir o caso de 68MB
- Rodar importação do mesmo PDF ~68MB e acompanhar logs:
  - Deve aparecer apenas tentativas com URI HTTPS completa
  - Não deve mais aparecer “Unsupported file URI type: files/…”
2) Regressão: PDF pequeno (<20MB)
- Confirmar que continua funcionando (esse caminho não depende do extractor streaming do Files API no seu fluxo atual).
3) Regressão: PDFs médios (20–45MB) se caírem no extractor
- Confirmar que o fluxo também funciona (deve melhorar, não piorar).

Riscos / Mitigações
- Risco: a API continuar respondendo “Request contains an invalid argument” mesmo com URI completa
  - Mitigação: logs por tentativa + `responseMimeType` + variantes de URI com/sem `/v1beta`.
  - Se persistir, o próximo passo seria ajustar o schema do payload para coincidir 100% com o formato REST oficial (manter só snake_case, por exemplo), mas isso só faremos se os logs mostrarem que camelCase é sempre rejeitado.

Resultado esperado
- O job não falha mais por causa de tentativas “shortUri”.
- A chamada ao `generateContent` passa a usar apenas URIs aceitas e, com a normalização, deve parar o 400 nesses PDFs grandes.

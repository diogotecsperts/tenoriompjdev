## Diagnóstico rígido

O erro agora está bem localizado: o PDF de 62,97 MB foi enviado corretamente para a Files API, mas a chamada de OCR falhou quando tentou ler o arquivo com o modelo configurado no DevPanel: `gemini-3.1-flash-lite`.

Evidências encontradas:
- Job afetado: `3705b14e-16f3-4649-942b-f9982bfa78cf`.
- Provider OCR atual: `gemini`.
- Modelo OCR atual: `gemini-3.1-flash-lite`.
- O upload por streaming aconteceu: `PDF 62.97MB → streaming direto ao Gemini Files API`.
- A falha vem depois, na leitura do arquivo: `Gemini Vision (Streaming) error: All attempts failed ... 400 INVALID_ARGUMENT`.
- A documentação atual do Google recomenda **Interactions API** para modelos Gemini 3.x com PDF/Files API.
- Há relatos recentes no fórum do Google de falhas específicas em PDF com modelos `gemini-3.1-flash-lite` e `gemini-3.5-flash`, enquanto `gemini-2.5-flash`, `gemini-2.5-pro` e `gemini-3.1-pro-preview` funcionam melhor para PDF.

Conclusão técnica: o problema não é mais “travamento” nem upload de 63 MB. O problema provável é **incompatibilidade/instabilidade do modelo `gemini-3.1-flash-lite` para OCR de PDF grande via Files API/generateContent**, agravada pelo fato de o código ter desativado a Interactions API após o erro anterior.

## Plano de correção

### 1. Corrigir o roteamento Gemini para PDF grande
- Para modelos Gemini 3.x (`gemini-3.1-flash-lite`, `gemini-3.5-flash`, `gemini-3-pro-preview`, etc.), usar **Interactions API** com payload documentado:
  - `input: [{ type: "text", text: prompt }, { type: "document", uri: fileUri, mime_type: "application/pdf" }]`
  - Sem `generation_config` arriscado no primeiro momento.
  - Sem `background: true` enquanto a compatibilidade não estiver comprovada, para reduzir variáveis.
- Para modelos Gemini 2.5, manter o caminho estável por `generateContent + file_data`.

### 2. Tornar `gemini-2.5-flash` o fallback técnico automático para OCR de PDF
- Se Gemini 3.x retornar `400 INVALID_ARGUMENT` ao processar PDF, repetir automaticamente uma única vez com `gemini-2.5-flash`.
- Isso não muda os dados salvos retroativamente; só evita que um modelo instável derrube o processamento.
- O resultado deve registrar o modelo efetivamente usado, para auditoria.

### 3. Proteger o DevPanel contra escolha instável para OCR
- No seletor de modelo OCR, marcar `gemini-2.5-flash` como recomendado para OCR de autos.
- Remover ou despriorizar `gemini-3.1-flash-lite`/`gemini-3.5-flash` do caminho de OCR, ou exibir aviso claro de instabilidade para PDF.
- Manter modelos 3.x disponíveis para geração textual se necessário, mas não como padrão de OCR.

### 4. Melhorar drasticamente a mensagem de erro
- Substituir a mensagem atual genérica por algo como:
  - “O modelo de OCR configurado (`gemini-3.1-flash-lite`) recusou este PDF. O arquivo foi enviado corretamente, mas o Gemini retornou erro 400 ao ler o documento. Tente `gemini-2.5-flash` ou aguarde a tentativa automática com fallback técnico.”
- Separar claramente:
  - tamanho do PDF,
  - modelo usado,
  - endpoint usado,
  - se houve fallback automático,
  - erro técnico resumido.

### 5. Adicionar logs decisivos para não trabalhar no escuro
- Logar, sem expor chave:
  - endpoint (`interactions` ou `generateContent`),
  - modelo,
  - tamanho do arquivo,
  - estado do arquivo na Files API,
  - tentativa de fallback,
  - trecho sanitizado do erro do provider.
- Isso evita novo ciclo de “erro vermelho sem causa clara”.

### 6. Ajustar o timeout sem mascarar erro
- Manter watchdog para não travar indefinidamente.
- Mas quando o provider retornar erro real antes do timeout, gravar esse erro no job imediatamente.
- O frontend deve mostrar a causa real, não só “backend/processamento”.

### 7. Validação após implementar
- Conferir configuração atual do DevPanel após ajuste.
- Reprocessar o PDF de 63 MB.
- Resultado esperado:
  - não trava em 18%,
  - se Gemini 3.x falhar, fallback para `gemini-2.5-flash`,
  - se ainda falhar, erro legível e acionável.

## Arquivos que serão alterados

- `supabase/functions/_shared/pdf-visual-extractor.ts`
  - corrigir roteamento Gemini 3.x/2.5,
  - reativar Interactions API de forma documentada,
  - adicionar fallback técnico para `gemini-2.5-flash`,
  - melhorar logs e detalhes de erro.

- `supabase/functions/_shared/ocr-router.ts`
  - registrar modelo efetivo e fallback técnico quando ocorrer.

- `supabase/functions/prev-pre-processar/index.ts`
  - classificar melhor erro Gemini 400 em OCR.

- `src/modules/previdenciario/api/processar.ts`
  - exibir mensagem amigável baseada no erro real do job.

- `src/components/dev-panel/DevSettings.tsx`
  - ajustar opções/avisos do modelo OCR para evitar `gemini-3.1-flash-lite` como escolha silenciosamente problemática.

## Decisão técnica principal

Para este caso específico, a correção mais segura é: **OCR de PDF grande deve preferir `gemini-2.5-flash` como modelo estável**, e modelos Gemini 3.x só devem ser usados com rota documentada e fallback automático. O erro atual indica que insistir em `gemini-3.1-flash-lite` para esse PDF tende a continuar falhando.
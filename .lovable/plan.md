# Trabalhista single-pass: honrar GLM/MiniMax do DevPanel (fim do "Gemini fantasma")

## Diagnóstico (confirmado no código e no DB)

Os registros que aparecem em **DevPanel → Logs de Uso de IA** a 03:57/03:58 são reais e vieram do módulo Trabalhista:

```
prompt_type=pdf_extraction | provider=lovable | model=google/gemini-2.5-flash
```

Origem: `supabase/functions/processar-autos/index.ts` L2415-2437 (fluxo **single-pass**). O código lê `phase1_ocr_provider = "glm"` do DevPanel mas então faz o mapeamento:

```ts
const rawOcrProvider = (pdfProviderMap['phase1_ocr_provider'] || 'gemini').toLowerCase();
const pdfProvider = rawOcrProvider === 'mistral' ? 'mistral-ocr' : 'gemini';
```

Ou seja: quando OCR ativo é **GLM** (ou **MiniMax**), o Trabalhista single-pass **descarta a configuração e cai em Gemini/Lovable**. Isso viola a Core rule "DevPanel AI = global" (`mem://architecture/devpanel-ai-config-global-scope`).

E o `pdf_fallback_provider` — chave legada usada só nesse fluxo — está `= "gemini"` no DB, reforçando o Gemini como último recurso.

Resposta direta às perguntas do usuário:

- **"Por que rodou Gemini às 03:58?"** — Um PDF do Trabalhista foi processado nesse horário; o roteamento single-pass ignorou o GLM ativo e chamou Gemini/Lovable. É bug de código, não de exibição.
- **"Os próximos vão vir corretos?"** — Não, enquanto esse mapeamento estiver hardcoded. Precisa da correção abaixo.

## Correção

Substituir o mapeamento legado por roteamento via `ocr-router` (já usado no Previdenciário e configurado pelo DevPanel). O router honra GLM, Mistral, MiniMax e Gemini, e aplica o fallback correto (`ocr_fallback_provider`, não o `pdf_fallback_provider` antigo).

**Arquivo:** `supabase/functions/processar-autos/index.ts`

1. **Bloco L2415-2437 (single-pass extraction):**
   - Remover o mapeamento `rawOcrProvider === 'mistral' ? 'mistral-ocr' : 'gemini'`.
   - Ler `phase1_ocr_provider` cru e passar para o mesmo helper `runOcrWithConfiguredProvider` que o Previdenciário usa. O helper já entrega texto OCR + provider real usado.
   - Se o provider ativo não for viável no ambiente de edge function single-pass (ex.: MiniMax OCR exige rasterização de browser), ainda assim tentar via router; se o router falhar, cair no `ocr_fallback_provider` do DevPanel — não em Gemini hardcoded.

2. **Bloco fallback L2380-2385 (após two-phase falhar):**
   - Trocar `callPDFProvider(..., { promptType: 'pdf_extraction' })` (que hoje chama Lovable/Gemini direto) por `runOcrWithConfiguredProvider` + `callAI(getAIConfig(), ...)` para o parse estruturado. OCR e IA generalista passam a refletir o DevPanel real.

3. **Log de `ai_usage_logs`:**
   - Manter `prompt_type: 'pdf_extraction'`, mas o `provider`/`model` gravados passam a ser os retornados pelo router (ex.: `provider="glm"`, `model="glm-ocr"`). Isso remove a poluição "lovable/google-gemini-2.5-flash" dos logs futuros.
   - Registros antigos permanecem — não vamos reescrever histórico. A tela apenas para de acumular Gemini fantasma dos próximos jobs.

4. **Warning coerente:**
   - Se um provider realmente não suportar single-pass no runtime da edge function, logar `logWarn` claro com o provider real e o motivo, em vez de silenciosamente cair em Gemini.

## Escopo

- **Único arquivo:** `supabase/functions/processar-autos/index.ts` (dois blocos, ~20 linhas cada).
- Zero mudanças em Previdenciário, Impugnação, DevPanel, ai-config, ocr-router ou DB.
- Nenhuma migração; a chave `pdf_fallback_provider` fica no DB inerte (não removeremos para não quebrar histórico).

## Como o usuário valida

1. Processar um novo PDF pelo Trabalhista com GLM/MiniMax selecionado no DevPanel.
2. Abrir **DevPanel → Logs de Uso de IA**: o novo registro `pdf_extraction` deve mostrar `provider=glm`, `model=glm-ocr` (ou `minimax`/`mistral`), nunca mais `lovable`+`google/gemini-2.5-flash`.
3. Registros anteriores continuam visíveis — são histórico verídico do bug corrigido.


# Plano replanejado

## Resposta ao ponto 2 (verificação, sem código)

Confirmado: a comunicação **Provider Inventory v2.0 → Extração de PDF ainda existe** e está funcionando.

- Em `DevSettings.tsx` linha 2525–2532, o `<Select>` do modelo Gemini para OCR usa `dynamicGeminiModels`, que é a mesma lista carregada pelo Provider Inventory (via `list-gemini-models` edge function).
- Filtra ainda por `supportsPdf !== false`, então modelos sem suporte a PDF são omitidos automaticamente.
- Ou seja: qualquer modelo Gemini novo que aparecer no Provider Inventory aparece também no card "Extração de PDF" como opção de OCR, sem intervenção manual.

Limitação atual (não é bug, é escopo): o seletor "Provedor de OCR" só oferece **Gemini** e **Mistral**. Provider Inventory não injeta *novos providers* aqui — só novos *modelos Gemini*. Se um dia você quiser um provider OCR novo (ex.: MiniMax), tem que adicionar a opção manualmente no `<Select>`.

## Regra a memorizar (ponto 1)

Vou salvar como regra Core de projeto, aplicada a toda ação futura:

> **Toda configuração de IA feita no DevPanel (provider padrão, modelo, provider de OCR, modelo de OCR, fallbacks, chaves) DEVE valer para todos os módulos do app (Trabalhista, Previdenciário, Impugnação e qualquer módulo futuro). É proibido hardcodear provider ou modelo de IA em edge function de módulo — sempre ler de `system_config` via os helpers existentes (`getAIConfig`, `phase1_ocr_provider`, `phase1_gemini_model`). Prompts e lógica de negócio ficam fora dessa regra: não são afetados pela troca de IA.**

## Correções de código (ponto 1, execução)

Três edge functions hoje ignoram o DevPanel e usam Mistral hardcoded. Vou corrigir as duas que faltam para respeitar `phase1_ocr_provider` + `phase1_gemini_model` (a de Trabalhista, `processar-autos`, já respeita).

### 1. `supabase/functions/prev-pre-processar/index.ts` (Previdenciário)

Trecho atual (linhas 660–669) chama `extractWithMistralOCR` direto. Substituir por um switch:

```ts
const aiConfig = await getAIConfig();          // já é chamado logo abaixo
const ocrProvider = aiConfig.phase1_ocr_provider || "gemini";

let ocr;
if (ocrProvider === "mistral") {
  const mistralKey = getMistralAPIKey();
  if (!mistralKey) return jsonError("MISTRAL_API_KEY não configurada", 500);
  ocr = await extractWithMistralOCR(pdfBytes, mistralKey);
} else {
  // Gemini (padrão) — reusa o extractor visual já usado em processar-autos
  ocr = await extractWithGeminiVisual(pdfBytes, {
    model: aiConfig.phase1_gemini_model || "gemini-2.5-flash",
  });
}
```

Reaproveita `supabase/functions/_shared/pdf-visual-extractor.ts`, que já existe e é o mesmo que `processar-autos` usa. Nada de novo.

### 2. `supabase/functions/extrair-texto-pdf/index.ts` (Impugnação)

Mesmo tratamento: ler `phase1_ocr_provider` de `system_config` e rotear entre Mistral e Gemini. Fallback: se a chave do provider escolhido estiver faltando, tenta o outro e loga o motivo.

### 3. DevPanel — só texto explicativo

Atualizar o subtítulo do card "Extração de PDF" para deixar claro que a escolha vale para **todos os módulos** (hoje o texto sugere que é só da "Fase 1" da importação). Sem mudar o comportamento visual.

## O que NÃO muda

- Nenhum prompt em `system_config`.
- Nenhum schema de banco.
- Nenhum fluxo de UI/UX.
- `processar-autos` (Trabalhista) fica intocado — já está correto.
- Fallback automático da Fase 2 (preenchimento de campos) fica intocado.

## Resultado esperado

Depois desta mudança: você troca "Provedor de OCR" no DevPanel → **os três pipelines** (Trabalhista, Previdenciário, Impugnação) passam a usar o provider escolhido a partir da próxima requisição. Sem cold start manual, sem código para editar de novo.

Aprovar para eu executar?

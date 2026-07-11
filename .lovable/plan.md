
# Unificar configuração de OCR e sincronizar modelos Gemini

## Objetivo
Acabar com a redundância entre "Extração de PDF (OCR)" e "Provedor de OCR (todos os módulos)". Passa a existir **um único bloco** que vale para todos os módulos, inclusive Trabalhista em Passagem Única. E qualquer dropdown de modelo Gemini passa a usar a lista dinâmica atualizada via botão "Atualizar Modelos".

## O que muda para o usuário

- No DevPanel some a seção **"Extração de PDF (OCR)"**.
- O bloco **"Provedor de OCR (todos os módulos)"** vira o único lugar para escolher provider + modelo de OCR. Fica bem visível dentro de "Estratégia de Importação" (com título mais claro tipo **"OCR — Provedor único para todos os módulos"**).
- A escolha feita ali passa a valer para:
  - Previdenciário (já valia)
  - Impugnação (já valia)
  - Trabalhista em Duas Fases (já valia)
  - **Trabalhista em Passagem Única (novo — antes usava o campo separado)**
- Lista dinâmica de modelos Gemini (botão "Atualizar Modelos") passa a alimentar **todos** os dropdowns de modelo Gemini, incluindo o do Provedor de OCR.

## Detalhes técnicos

### 1. UI (`src/components/dev-panel/DevSettings.tsx`)
- Remover o Card "Extração de PDF (OCR)" (linhas ~1982–2395), incluindo os helpers exclusivos (`pdfProviderHasCustomInput`, `getPdfProvider`, `getPdfProviderModels`, painéis Mistral OCR/Gemini específicos daquele bloco).
- No bloco "Provedor de OCR" (linha ~2453):
  - Renomear título para deixar claro que é o único e vale para tudo.
  - Trocar o `<Select>` de modelo Gemini (que hoje usa lista estática) para consumir `dynamicGeminiModels` quando disponível (mesmo padrão da linha 2145), com fallback para a lista estática.
  - Adicionar botão pequeno "Atualizar modelos" ao lado (reaproveitando a função existente `fetchAvailableGeminiModels`).

### 2. Backend (`supabase/functions/processar-autos/index.ts`)
Fluxo single-pass hoje lê `pdf_ai_provider`/`pdf_ai_model` (linha ~2398–2405). Trocar para ler `phase1_ocr_provider` + o modelo correspondente:
- Se provider = `gemini` → usar `phase1_gemini_model`.
- Se provider = `mistral` → usar `mistral-ocr-latest` (já é o único suportado).
- Se provider = `minimax` → usar `MiniMax-M3` (respeitando a regra de rasterização client-side já existente; se não puder, cai no fallback do router).
- Manter fallback silencioso: se `phase1_ocr_provider` estiver vazio → `gemini` + `gemini-2.5-flash`.

Não mexer em `ocr-router.ts` — já está correto e continua sendo a fonte única para os módulos OCR-only.

### 3. `getPdfAIConfig` (`supabase/functions/_shared/ai-config.ts` linha ~796)
Se ainda houver consumidor dessa função, redirecioná-la para ler `phase1_ocr_provider`/`phase1_gemini_model` em vez de `pdf_ai_provider`/`pdf_ai_model`. Se não houver mais consumidor após a mudança do processar-autos, remover a função.

### 4. DevAIStatus (`src/components/dev-panel/DevAIStatus.tsx`)
Trocar leitura de `pdf_ai_provider`/`pdf_ai_model` por `phase1_ocr_provider`/`phase1_gemini_model` no card que mostra o status do OCR.

### 5. ImportarAutosDialog (`src/components/tools/ImportarAutosDialog.tsx` linha ~299–325)
Simplificar: sempre usar `phase1_ocr_provider`/`phase1_gemini_model` (elimina o branch `single-pass vs two_phase` para escolha de OCR).

### 6. Chaves órfãs no `system_config`
Manter as linhas antigas (`pdf_ai_provider`, `pdf_ai_model`, `gemini_pdf_model`, `pdf_fallback_*`) na tabela — não removo dados. Só param de ser lidas/escritas. Se o usuário quiser limpar depois, faço em ação separada.

## Fora de escopo
- Não mexo em prompts, na lógica de OCR em si, em `ocr-router.ts`, no MiniMax client, nem no toggle single-pass vs two_phase.
- Não altero secrets nem chaves de API.
- Não altero nada de UI dos módulos (Prev, Impugnação, Trabalhista) — só o DevPanel.

## Como validar depois
1. DevPanel: existe **um** bloco de OCR, com lista Gemini atualizada.
2. Trocar OCR para Gemini + rodar importação Trabalhista single-pass → logs do `processar-autos` mostram `provider=gemini` e modelo escolhido.
3. Rodar importação Prev/Impugnação → `[ocr-router] provider=gemini` no log (comportamento anterior mantido).
4. Trocar OCR para MiniMax → Trabalhista single-pass e Prev usam o mesmo provider.

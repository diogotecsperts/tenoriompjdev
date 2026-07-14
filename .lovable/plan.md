# Labels dinâmicos em todas as etapas (OCR + IA generalista)

Hoje só o label de OCR mostra o provider real. As etapas `ai_extraction` e `ai_refinement` aparecem como "Extraindo dados" / "Refinando campos" sem dizer qual IA está rodando. Vamos estender o mesmo padrão dinâmico do OCR para as fases de IA generalista.

## Diagnóstico

- Backend (`supabase/functions/prev-pre-processar/index.ts` L741-747): quando o job entra em `ai_extraction`, o `updateJob` grava `provider: ocr.provider, model: ocr.model` — ou seja, o job continua reportando o provider do OCR mesmo já estando na fase de IA. Isso precisa mudar.
- Frontend (`src/modules/previdenciario/api/processar.ts`): `formatStageLabel(stage, provider)` já existe e só cobre stages de OCR.

## Mudanças

**1. Backend — refletir provider real da IA generalista no job:**
- Em `prev-pre-processar/index.ts`, no início de `processStructuredExtraction` (após obter `aiConfig` na L749), fazer um segundo `updateJob` com `provider: aiConfig.provider, model: aiConfig.model` (mantendo `stage: ai_extraction`). Assim o polling passa a ver o provider da IA nessa etapa.
- Aplicar o mesmo antes de `stage: ai_refinement` (L829): reafirmar `provider/model` do `aiConfig` (que pode ser o mesmo, mas mantém a semântica clara e sobrevive se o refinement mudar de provider no futuro).
- Não tocar em nenhuma outra lógica do worker.

**2. Frontend — label dinâmico para todos os stages:**
- Em `src/modules/previdenciario/api/processar.ts`:
  - Ampliar `providerDisplayName` para reconhecer também os generalistas usados em `getAIConfig` — checar variantes: `openai`/`gpt` → "OpenAI", `anthropic`/`claude` → "Claude", `google`/`gemini` (já cobre), `minimax` (já), `mistral` (já), `glm`/`zhipu` → "GLM", `lovable`/`lovable-ai` → "Lovable AI". Fallback: exibir o próprio nome capitalizado do provider.
  - Reescrever `formatStageLabel(stage, provider)`:
    - `ocr_processing` → `OCR {name} em execução` (sem name → "OCR em execução")
    - `ocr_completed` → `OCR {name} concluído`
    - `ai_extraction` → `Extraindo dados via {name}` (sem name → "Extraindo dados")
    - `ai_refinement` → `Refinando campos via {name}`
    - outros stages ficam iguais (Baixando PDF / Salvando resultado / etc.)
- O `provider` continua vindo de `status.provider` — o mesmo campo do job. Como o backend agora o atualiza por fase, o label reflete automaticamente o **que está ativo no DevPanel no momento** (OCR na fase 1, generalista na fase 2), sem hardcode.

**3. Fallback defensivo:**
- Se `status.provider` chegar vazio numa dessas fases (backend antigo, retry, etc.), o label degrada gracefully para "Extraindo dados" / "Refinando campos" sem quebrar nada.

## Arquivos

- `supabase/functions/prev-pre-processar/index.ts` (dois `updateJob` adicionais nas transições ai_extraction/ai_refinement)
- `src/modules/previdenciario/api/processar.ts` (expandir `providerDisplayName` + `formatStageLabel`)

Sem migração de banco, sem toque em `ocr-router`, `ai-config`, ou no fluxo de OCR/IA em si. Zero impacto em Trabalhista/Impugnação.

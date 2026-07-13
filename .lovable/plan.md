## Plano confirmado — Limpeza segura de `system_config`

Escopo mínimo, sem tocar em OCR, upload, prompts, campos, exports ou Trabalhista two_phase.

### Passo 1 — Migração SQL

- Apagar `pdf_ai_provider` de `system_config` (código morto).
- Apagar `fallback_ai_provider` e `fallback_ai_model` de `system_config`.
- **Manter** `text_fill_provider` / `text_fill_model` (two_phase do Trabalhista pode usar).
- **Manter** `default_ai_provider` / `default_ai_model` (sua MiniMax M3 é gravada aqui — é a IA principal).
- Verificar e reportar (sem alterar) o valor atual de `default_ai_*` — se estiver diferente de MiniMax M3, sinalizo antes de qualquer outra ação.

### Passo 2 — Remover código órfão

**`supabase/functions/_shared/ai-config.ts`**
- Remover `callAIWithFallback`. Substituir chamadas por `callAI` direto.
- Remover leitura de `fallback_ai_provider` / `fallback_ai_model` do `getAIConfig`.
- Resultado: se a IA principal falhar (429/5xx/timeout), erro sobe direto para o caller. Sem retry silencioso em outro provider.

**`src/components/dev-panel/DevAIStatus.tsx`**
- Remover a linha "Fallback" do painel.
- Manter só "IA Principal" e "OCR".

**`src/components/dev-panel/DevSettings.tsx`**
- Remover seção "Fallback AI" do formulário.
- Remover seção "PDF AI Provider" do formulário.
- Remover campos `fallback_ai_*` e `pdf_ai_provider` do `DEFAULT_CONFIG` e do payload salvo.

Nada mais é tocado nesse passo.

### Passo 3 — Verificação após a mudança

- Abrir DevPanel: confirmar que "IA Principal" mostra MiniMax M3 e "OCR" mostra o provider que você escolheu.
- Confirmar via typecheck que nenhuma referência a `fallback_ai_*` / `pdf_ai_provider` / `callAIWithFallback` sobrou.

---

## Impacto esperado

| Item | Estado após execução |
|---|---|
| Upload de PDF | Intacto |
| OCR (Prev, Impugnação, Trabalhista) | Intacto |
| Preenchimento de campos com MiniMax M3 | Intacto |
| Trabalhista single_pass | Intacto |
| Trabalhista two_phase | Intacto (chaves mantidas) |
| Retry cross-provider automático | **Removido** — falhas viram erro visível |
| DevPanel | Mais enxuto: só IA Principal + OCR |
| Prompts, campos, exports, laudo-structure | Intactos |

## Próximo plano (após aprovação e execução deste)

Assim que este for aplicado e você validar no DevPanel, apresento o plano separado para o **PDF grande** — foco em:
- Restaurar caminho estável para PDFs pequenos (≤20MB) que quebrou nas últimas iterações.
- Atacar o gargalo real do PDF grande (114 páginas / 63MB): paralelismo real na rasterização client-side do MiniMax, sem trocar provider automaticamente.
- Auditoria por job (tamanho, páginas, chars, tempo, chunks) visível no DevPanel.

Sem misturar os dois — você aprova um risco por vez.

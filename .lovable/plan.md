# Ajustes de clareza no DevPanel + limpeza de "Providers Permitidos"

## Respostas rápidas às suas dúvidas

**1. Posso deixar MiniMax M3 no Provider Inventory e Gemini 3 Flash em OCR?**
Sim, sem conflito. São camadas independentes:
- **Provider Inventory** = provedor/modelo usado para **gerar o laudo** (preenchimento dos campos, análise técnica).
- **OCR (Estratégia de Importação)** = provedor/modelo usado para **ler o PDF** e transformar em texto.
Você pode ter Gemini fazendo o OCR e MiniMax gerando o laudo, ou qualquer combinação.

**2. Os textos do "Modo de Importação" e da "Fase 1/Fase 2" estão desatualizados** — vou reescrever (ver abaixo).

**3. "Providers Permitidos" está quebrado.** Investiguei: a chave `allowed_ai_providers` é salva em `system_config`, mas **não é lida por nenhuma edge function nem pelo Provider Inventory**. Ou seja, marcar/desmarcar ali não bloqueia nada — é código morto. Como você mesmo disse que prefere remover se não tiver função, **vou removê-lo**. Gate real por provider já existe implicitamente (se o secret do provider não estiver configurado, ele não aparece funcional).

---

## Mudanças de UI (arquivo único: `src/components/dev-panel/DevSettings.tsx`)

### A. Reescrever descrição do toggle "Modo de Importação"

Substituir o texto atual por algo direto:

> **Passagem Única** — Um único provedor faz OCR + preenchimento do laudo na mesma chamada. Mais rápido, porém limitado a PDFs pequenos (~20 MB) e exige um provedor multimodal robusto.
>
> **Duas Fases (Recomendado)** — Etapa 1: Gemini lê o PDF (suporta arquivos grandes, até 2 GB, e páginas escaneadas). Etapa 2: o provedor definido no **Provider Inventory** recebe só o texto e preenche o laudo. Mais barato e estável.
>
> ⚠️ Este toggle afeta **apenas o Trabalhista**. Previdenciário e Impugnação sempre usam Duas Fases.

### B. Reescrever bloco explicativo "Fase 1 / Fase 2"

Substituir por:

> **Fase 1 — OCR:** o provedor configurado em "OCR — Provedor único para todos os módulos" lê o PDF e devolve o texto (inclusive de páginas escaneadas). Gemini é o único que suporta PDFs muito grandes via Google Files API (até 2 GB).
>
> **Fase 2 — Preenchimento:** o provedor/modelo definido no **Provider Inventory** recebe apenas o texto extraído e preenche cada campo do laudo. Como não precisa "ver" o PDF, pode ser um modelo mais barato (ex.: MiniMax M3, DeepSeek).
>
> **Resumo visual:** `PDF → [OCR provider] → texto → [Provider Inventory] → laudo`

### C. Remover card "Providers Permitidos"

- Remover o Card completo (aprox. linhas 2419–2450).
- Remover do `DEFAULT_CONFIG` a chave `allowed_ai_providers` (linha 232).
- Remover do type/interface a propriedade `allowed_ai_providers` (linha 55).
- Remover do carregamento inicial (linha 655) e do payload de save (linhas 850–853).
- Remover a função `toggleProvider` (linha 1117) se não for usada em outro lugar.
- **Não** apagar a coluna no banco — só deixar de ler/escrever, pra não perder histórico. Chave órfã em `system_config` fica inerte.

---

## Fora de escopo

- Não mexer no Provider Inventory nem no bloco de OCR unificado (já foram tratados na rodada anterior).
- Não mexer em edge functions — nada consome `allowed_ai_providers`, então a remoção é puramente de UI.
- Não mexer em prompts, MiniMax, ou lógica de importação.

## Validação

1. Abrir DevPanel → confirmar que os dois blocos de texto (Modo de Importação + Fase 1/2) mostram a nova redação.
2. Confirmar que o card "Providers Permitidos" sumiu.
3. Salvar configurações → não deve dar erro de tipo nem 400 do Supabase.
4. Abrir importação (Trabalhista) → confirmar que troca de Passagem Única ↔ Duas Fases continua funcionando.

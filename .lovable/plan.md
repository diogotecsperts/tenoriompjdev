
# Avaliação e Plano — Modo Debug nos Geradores DOCX e PDF

## Diagnóstico do Estado Atual

Após leitura integral de ambos os arquivos, o estado é:

**`generateLaudoDOCX.ts` (916 linhas):**
- `sanitizeMarkdown` na linha 68 — função pura, sem side effects
- `isFieldEmpty` na linha 60 — função pura, sem side effects
- `createParagraphs` na linha 213 — ponto central de consumo dos campos longos
- A função principal `generateLaudoDOCX` começa na linha ~300 e consome `laudo.*` via `isFieldEmpty` + `createParagraphs` / `createLabeledField`

**`generateLaudoPDF.ts` (955 linhas):**
- `sanitizeMarkdown` na linha 81 — mesma estrutura
- `isFieldEmpty` na linha 73 — mesma estrutura
- `addParagraph` na linha 223 — função central que já chama `sanitizeMarkdown` internamente

---

## Viabilidade: ALTA — Zero Risco

As duas sugestões são implementáveis com segurança total porque:

1. **Controladas por flag de ambiente** — o debug usa `import.meta.env.DEV` (variável nativa do Vite que é `true` apenas em desenvolvimento local e nunca em produção). Não requer flag manual, configuração adicional ou parâmetro na função.

2. **Zero impacto em produção** — em build de produção (`npm run build`), o Vite remove automaticamente código morto dentro de `if (import.meta.env.DEV)` via tree-shaking. O bundle final não conterá os logs.

3. **Zero impacto na lógica** — os logs são inseridos como observadores passivos. Nenhuma variável de estado, nenhum retorno de função, nenhuma ordem de execução é alterada.

4. **Não duplica processamento** — o debug captura o valor original ANTES de sanitizar e o resultado DEPOIS, sem chamar `sanitizeMarkdown` duas vezes (captura o resultado já computado).

---

## O que Será Implementado

### Operação A — `debugField` em `generateLaudoDOCX.ts`

Uma função utilitária de debug inserida logo após `isFieldEmpty` (linha 65), ativa somente em `DEV`:

```typescript
const debugField = (fieldName: string, value: string | null | undefined): void => {
  if (!import.meta.env.DEV) return;
  const empty = isFieldEmpty(value);
  const original = (value ?? "").substring(0, 100);
  const sanitized = empty ? "[SUPRIMIDO]" : sanitizeMarkdown(value!).substring(0, 100);
  console.group(`[DOCX DEBUG] ${fieldName}`);
  console.log("Original :", original || "(vazio)");
  console.log("Sanitized:", sanitized);
  console.log("isEmpty  :", empty);
  console.groupEnd();
};
```

Esta função será chamada em **todos os campos longos** da função principal — nos pontos onde `isFieldEmpty` já é chamado, adicionando `debugField("nomeDoCampo", laudo.campo)` logo abaixo, sem alterar nenhuma lógica.

Campos cobertos pelo debug no DOCX:
- `resumoPeticaoInicial`, `resumoContestacao`, `metodologiaPericial`
- `descricaoTecnicaDoencas`, `nexoCausalJustificativa`
- `analiseIncapacidadeLaboral`, `conclusaoAnalise`
- `laudosMedicos`, `examesComplementares`
- `processoVara`, `processoNumero`, `reclamante`, `reclamada`

### Operação B — `debugField` em `generateLaudoPDF.ts`

Mesma função `debugField` inserida após `isFieldEmpty` (linha 78), com prefixo `[PDF DEBUG]`. O PDF usa `addParagraph` como ponto central que já chama `sanitizeMarkdown` internamente, então os logs serão inseridos nos pontos de chamada da função principal, analogamente ao DOCX.

### Saída Visual no Console (exemplo)

```
[DOCX DEBUG] resumoPeticaoInicial
  Original : ### 1. DEMANDAS CRÍTICAS\n*   **Capacidade de Resistência à Fadiga:** Nece...
  Sanitized: 1. DEMANDAS CRÍTICAS\nCAPACIDADE DE RESISTÊNCIA À FADIGA: Nece...
  isEmpty  : false

[DOCX DEBUG] conclusaoAnalise
  Original : [INSERIR CID/DOENÇA, EX: SÍNDROME DO TÚNEL DO CARPO...]
  Sanitized: [SUPRIMIDO]
  isEmpty  : true
```

---

## Escopo dos Arquivos

| Arquivo | Mudança |
|---|---|
| `src/utils/generateLaudoDOCX.ts` | Adicionar função `debugField` + chamadas nos campos longos |
| `src/utils/generateLaudoPDF.ts` | Adicionar função `debugField` + chamadas nos campos longos |

- Nenhuma migração de banco
- Nenhuma edge function
- Nenhum prompt alterado
- Nenhuma dependência nova
- Zero impacto em produção (Vite elimina `import.meta.env.DEV` no build)

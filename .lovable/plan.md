
## Diagnóstico (por que “impugnacao” não aparece no DevPanel > Prompts IA)

- O prompt **existe** no backend (tabela `system_config`) e também **existe no código-fonte** (em `seed-prompts`), com:
  - `id: prompt_system_impugnacao`
  - `cardId: impugnacao`
  - `sectionId: resposta`
- Porém, a UI do DevPanel (`src/components/dev-panel/DevPrompts.tsx`) **só renderiza prompts “classificados”** se o `cardId/sectionId` existir na estrutura conhecida `LAUDO_STRUCTURE`.
- Hoje, `LAUDO_STRUCTURE` é construído a partir de:
  - `LAUDO_CARDS_STRUCTURE` (estrutura do LaudoEditor)
  - `PROMPT_ONLY_CARDS` (cards extras “só para prompts”)
- **A categoria `impugnacao` não está em `PROMPT_ONLY_CARDS`**, então o prompt fica em um “limbo”:
  - Ele é considerado “classificado” (tem `cardId` e `sectionId`)
  - Mas não entra em nenhum agrupamento exibido
  - Resultado: **não aparece em lugar nenhum na lista**

## Resposta objetiva sobre “Restaurar Tudo” (e seus receios)

- “Restaurar Tudo” chama a função `seed-prompts` com `action: 'seed'`, que faz duas coisas:
  1) **Deleta prompts órfãos** (existem no banco mas não existem mais no código).
  2) **Sobrescreve o conteúdo** dos prompts do banco com o conteúdo “padrão de fábrica” do código.
- Você NÃO vai “perder” o `prompt_system_impugnacao` por causa do restore, porque ele está no código (`seed-prompts`) e portanto **não é órfão**.
- O risco real do “Restaurar Tudo” é outro: **ele vai sobrescrever seus prompts personalizados** (os 8 “Personalizados” que você viu).
- Então, se o objetivo for somente “arrumar a lista” / “limpar órfãos”, **não recomendo** “Restaurar Tudo” agora.

## Objetivo do ajuste agora

1) Fazer a categoria **Impugnação** aparecer em DevPanel > Prompts IA.
2) Garantir que o prompt `prompt_system_impugnacao` apareça dentro dela.
3) Evitar que qualquer prompt “classificado” com `cardId/sectionId` desconhecidos fique invisível no futuro (segurança de UX).

---

## Mudanças propostas (mínimas e seguras)

### A) Adicionar “Impugnação” como card exclusivo de prompts (não mexe no LaudoEditor)
**Arquivo**: `src/lib/laudo-structure.ts`

- Incluir um novo item em `PROMPT_ONLY_CARDS`:
  - `id: "impugnacao"`
  - `label: "Impugnação"`
  - `sections: [{ id: "resposta", label: "Resposta à Impugnação" }]`

Impacto:
- Isso **não entra** no LaudoEditor (porque o LaudoEditor usa `LAUDO_CARDS_STRUCTURE` e ignora `PROMPT_ONLY_CARDS`).
- Isso **entra** no DevPrompts, porque ele usa `[...LAUDO_CARDS_STRUCTURE, ...PROMPT_ONLY_CARDS]`.

### B) (Opcional, mas recomendado) Adicionar ícone para “Impugnação” no DevPanel
**Arquivo**: `src/components/dev-panel/DevPrompts.tsx`

- Incluir `impugnacao` no `cardIcons` para ficar visualmente consistente (se não fizer, ele usa um ícone padrão; não quebra nada).

### C) (Recomendação de segurança) Não deixar prompts “classificados” sumirem se tiverem card/section desconhecidos
**Arquivo**: `src/components/dev-panel/DevPrompts.tsx`

Hoje:
- Se `p.cardId/p.sectionId` não existirem no `LAUDO_STRUCTURE`, o prompt simplesmente não é renderizado.

Ajuste simples:
- Ao montar as listas:
  - Continuar considerando “classificados” apenas os prompts com `cardId/sectionId`
  - Mas se o `cardId/sectionId` não existir na estrutura, tratar como “não classificado” (ou “inconsistente”) e exibir na aba “Não classificados” com um aviso.

Isso evita que qualquer prompt fique invisível por divergência de metadados.

---

## Como proceder agora (orientação prática para você)

1) **Não clique em “Restaurar Tudo”** se você quer preservar seus 8 prompts personalizados.
2) No seu caso, como “Desatualizados = 0” e “Novos = 0”, não há nada para “Sincronizar Labels”.
3) O problema principal é só de **UI/estrutura**: a categoria “impugnação” não existe na árvore do DevPanel — vamos corrigir com as mudanças acima.
4) Depois que a categoria aparecer, você verá o prompt “Instruções para Gerar Resposta a Impugnação” dentro dela e poderá editar normalmente.

---

## Verificação (checklist de validação)

Após implementar:

1) Abrir **DevPanel > Prompts IA**
2) Confirmar que existe o card/categoria **Impugnação**
3) Confirmar que dentro dele aparece:
   - `prompt_system_impugnacao` (descrição: “Instruções para Gerar Resposta a Impugnação”)
4) Testar o fluxo end-to-end:
   - Ir em “Responder Impugnação”
   - Clicar “Gerar com IA”
   - Confirmar que funciona e que alterações no prompt refletem na próxima geração

---

## Risco e impacto

- Risco para “Laudos”: **zero** (não altera LaudoEditor nem prompts de laudo).
- Risco para “Impugnação”: **muito baixo** (só melhora visibilidade/organização do prompt já existente).
- Benefício: o prompt deixa de ficar “invisível” e a estrutura do DevPanel passa a refletir corretamente o que o backend já suporta.

## Onde o texto está

O parágrafo "Diante do exposto, destituído de qualquer parcialidade..." é o texto fixo `EXAME_FISICO_TEXTOS.complementacao` em `src/modules/previdenciario/lib/prelaudo-structure.ts` e é usado em três lugares:

1. Editor — `src/modules/previdenciario/components/steps/Step03ExameFisico.tsx` (linha 35), hoje dentro de um bloco cujo título é **"Complementação"**.
2. Export PDF — `src/modules/previdenciario/lib/export/prelaudo-pdf.ts` (linha 385), sem título antes; existe um `sectionTitle("Conclusão")` mais abaixo, só quando algum radio de incapacidade está preenchido.
3. Export DOCX — `src/modules/previdenciario/lib/export/prelaudo-docx.ts` (linha 262), mesma situação.

Os radios de incapacidade (função habitual / vida independente) já existem no app:

- Fonte: `INCAPACIDADE_OPCOES` em `prelaudo-structure.ts` (4 opções: Não há incapacidade / Temporária, já cessada / Temporária, ainda presente / Permanente).
- Editor: renderizados na `Section title="Conclusões"` do Step03, logo abaixo do bloco "Complementação".
- Export: renderizados como frase curta "Apresenta, para a sua função habitual: <valor>." (formato diferente do que o cliente pediu).

O projeto já tem helper pronto para o formato "(X)/( )" que o cliente pediu: `buildOptionRows` em `src/modules/previdenciario/lib/export/_shared.ts` (usado hoje em Estado civil, Escolaridade, Comorbidades). Vou reutilizar esse mesmo helper — nada novo é criado.

## O que muda (mínimo, cirúrgico)

### 1) Editor — Step03ExameFisico.tsx

- Renomear o bloco `title="Complementação"` (linha 35) para **`title="Conclusão"`**. O corpo permanece `EXAME_FISICO_TEXTOS.complementacao` e o layout `FixedBlock` já insere o espaçamento entre o título e o parágrafo.
- Mover a `Section title="Conclusões"` (com os dois `RadioGroupLine`) para **dentro** do bloco "Conclusão", logo abaixo do parágrafo fixo, para bater com a ordem exportada. Renomear a legenda interna para exatamente o que o cliente escreveu:
  - "Incapacidade para sua função habitual:"
  - "Incapacidade para a vida independente:"
- Nenhuma mudança em `INCAPACIDADE_OPCOES`, no `onChange`, no salvamento ou no comportamento dos radios.

### 2) Export PDF — prelaudo-pdf.ts (bloco `exame_fisico`, linhas 380–400)

Nova ordem:

```text
sectionTitle("Exame físico")
paragraph(EXAME_FISICO_TEXTOS.estado_mental)
paragraph(EXAME_FISICO_TEXTOS.ectoscopia)
paragraph(EXAME_FISICO_TEXTOS.inspecao_dinamica)

sectionTitle("Conclusão")             // NOVO título fixo
paragraph(EXAME_FISICO_TEXTOS.complementacao)   // parágrafo fixo (com o espaçamento padrão que sectionTitle já dá)

// Bloco 1 — checkboxes (formato pedido pelo cliente)
paragraph("Incapacidade para sua função habitual:")
renderOptionRows(buildOptionRows(
  INCAPACIDADE_OPCOES.map(o => o.label),
  INCAPACIDADE_LABEL[ex.incap_funcao_habitual ?? ""]
))

// Bloco 2
paragraph("Incapacidade para a vida independente:")
renderOptionRows(buildOptionRows(
  INCAPACIDADE_OPCOES.map(o => o.label),
  INCAPACIDADE_LABEL[ex.incap_vida_independente ?? ""]
))
```

- Remover o `sectionTitle("Conclusão")` duplicado (linhas 390–392) e as duas linhas "Apresenta, para a sua função habitual: ..." / "Apresenta, para a vida independente: ..." (linhas 393–398) — substituídas pelos blocos acima.
- A renderização de linhas `(X) / ( )` reaproveita o mesmo mecanismo já usado em Comorbidades/Escolaridade (`renderOptionsBlock`/equivalente já presente no arquivo — mesmo padrão do restante do laudo, com o mesmo estilo visual).

### 3) Export DOCX — prelaudo-docx.ts (bloco `exame_fisico`, linhas 255–280)

Mesmas mudanças do PDF, usando `buildOptionRows` e o mesmo helper `buildMultiOptionRows`/formatter de linhas `(X)/( )` que hoje já é usado nas outras listas do DOCX (Comorbidades etc.). Remover o `sectionTitle("Conclusão")` condicional e as duas frases "Apresenta, para a..." (linhas 268–279).

## Regras herdadas que continuam valendo

- **IA:** este bloco continua 100% fixo (texto do dicionário + seleção manual dos radios). Nenhum campo aqui é gerado por IA, portanto não há botão de regenerar, nem "aura" de campo IA, nem interpolação de prompt — coerente com as regras de "Anti-Hallucination" e "Zero-Touch Import".
- **Grifado laranja `[DB]` (fixed field styling):** as opções de incapacidade são conteúdo fixo escolhido pelo médico (radio), não texto vindo do banco por interpolação de prompt, então não recebem `[DB]` — segue o mesmo padrão das listas de Estado civil, Escolaridade e Comorbidades fixas, que também não recebem `[DB]`. Nada nas regras de export compliance é violado: sem "IA", sem markdown, negrito → CAIXA ALTA quando aplicável, título "Conclusão" em maiúsculas conforme o padrão do `sectionTitle`.
- **Parágrafo separando título e texto:** o `sectionTitle`/`FixedBlock` já aplica o espaçamento padrão entre o título e o parágrafo (mesmo comportamento de "Exame físico", "Queixa principal" etc.). Não é preciso injetar `<br>` manual.

## O que NÃO muda

- Texto de `EXAME_FISICO_TEXTOS.complementacao` — idêntico.
- `INCAPACIDADE_OPCOES` / `INCAPACIDADE_LABEL` / tipos de `ExameFisicoData` — idênticos.
- Nenhuma alteração em prompts, DB, edge functions, DevPanel, módulo Trabalhista, outras etapas do Previdenciário, PDF de Impugnação ou Laudo Trabalhista.
- Dados já salvos (`incap_funcao_habitual`, `incap_vida_independente`) continuam válidos e passam a ser exportados no novo formato automaticamente.

## Verificação

- Editor Step 3: o bloco antes do "Diante do exposto..." lê **Conclusão**; logo abaixo do parágrafo aparecem "Incapacidade para sua função habitual:" e "Incapacidade para a vida independente:" com os quatro botões cada.
- Exportar PDF e DOCX de uma perícia com uma opção marcada em cada grupo:
  - Aparece um título **CONCLUSÃO** único.
  - Abaixo dele, o parágrafo "Diante do exposto...".
  - Em seguida, duas listas `(X)/( )` no formato exato pedido pelo cliente, com apenas a opção escolhida marcada.
- Exportar sem nenhuma opção marcada: o título e o parágrafo fixo aparecem; as duas listas aparecem com todas as opções `( )` (nenhuma marcada), coerente com o que hoje já acontece em Estado civil quando vazio.

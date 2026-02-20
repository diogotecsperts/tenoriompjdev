
# Auditoria da Análise do Gem Gemini — Veredicto Real por Campo

## Metodologia da auditoria

Lí o código-fonte real de 4 arquivos críticos:
- `supabase/functions/processar-autos/index.ts` (2842 linhas)
- `supabase/functions/_shared/build-import-prompt.ts` (636 linhas)
- `supabase/functions/_shared/mistral-ocr.ts` (227 linhas)
- `supabase/functions/_shared/prompt-manager.ts` (494 linhas)

---

## DIAGNÓSTICO CENTRAL DO GEM — É REAL?

O Gem afirma: *"o problema central é o colapso do JSON.parse() causado por formatação markdown (asteriscos, negritos) injetada pela IA dentro dos valores do JSON".*

**Veredicto: PARCIALMENTE CORRETO, mas o diagnóstico está incompleto.**

### O que o código mostra de verdade:

**Ponto 1 — O risco existe e é comprovado no código**

No `build-import-prompt.ts` (linhas 293–294), o default do `prompt_import_laudosMedicos` instrui a IA a usar `**Laudo Dr. [Nome]**` dentro da resposta:
```
"**Laudo Dr. [Nome] - [Especialidade] (DD/MM/AAAA):**
- Diagnósticos: [listar com CIDs]"
```

No `build-import-prompt.ts` (linha 310), o default do `prompt_import_examesComplementares` instrui:
```
"**RNM Coluna Lombar (15/03/2023):** Protrusão discal..."
```

No `build-import-prompt.ts` (linhas 154, 167, 393), os prompts `historicoOcupacional`, `historiaAcidente` e `quesitos` começam com `**EXTRAÇÃO OBRIGATÓRIA**`.

No `defaultSystemPrompt` do `processar-autos/index.ts` (linhas 211–215), o mesmo modelo existe no fallback monolítico.

**Esses asteriscos duplos no corpo dos exemplos de formato instruem a IA a usar markdown dentro dos valores de string JSON — e isso pode quebrar o JSON.parse().**

**Ponto 2 — O sistema TEM defesa contra isso, mas ela tem limites**

O `tryFixTruncatedJson` (linhas 430–601) faz 8 etapas de reparo:
- Extrai JSON de blocos markdown
- Escapa `\n`, `\r`, `\t` dentro de strings
- Remove trailing commas
- Fecha estruturas truncadas

Porém: **asteriscos `*` não são caracteres ilegais em JSON**. Se a IA escrever `"laudos_medicos": "**Laudo Dr. Silva**"`, o JSON é válido. O problema real é diferente: a IA, ao ver exemplos com markdown nos prompts, **tende a achar que deve usar formatação visual e extrapola isso para outros campos**, produzindo respostas inconsistentes.

**Ponto 3 — O problema mais grave está em outro lugar**

O Gem focou nos asteriscos, mas o `defaultSystemPrompt` já tem na linha 388–390:
```
"Retorne APENAS o objeto JSON, sem markdown, sem ```, sem explicações.
Comece diretamente com { e termine com }
NÃO use blocos de código. Apenas JSON puro."
```

E o `IMPORT_PROMPT_FOOTER` no `build-import-prompt.ts` tem a mesma instrução (linhas 114–118).

Então o footer proíbe markdown geral, mas os próprios exemplos nos prompts individuais **ensinam a IA a usar markdown nos valores**. Isso é uma contradição interna real.

---

## AVALIAÇÃO PROMPT A PROMPT

### 1. `prompt_import_system` (nova chave sugerida pelo Gem)

**Veredicto: A chave NÃO EXISTE no sistema — mas a ideia é implementada de outra forma.**

O sistema usa `IMPORT_PROMPT_HEADER` + `IMPORT_PROMPT_FOOTER` como constantes hardcoded no `build-import-prompt.ts`. O footer já proíbe markdown explicitamente. O Gem não sabia que isso existe porque não tem acesso ao código.

**O que o Gem sugere já existe**, mas em formato de constante no código, não no banco. A regra anti-markdown **está lá** — o problema é que contradiz os exemplos nos prompts individuais.

**Conclusão:** A sugestão de criar `prompt_import_system` é desnecessária. A correção real é remover os exemplos com markdown dos prompts individuais.

---

### 2. `prompt_import_laudosMedicos` — Markdown no exemplo

**Veredicto: PROBLEMA REAL E CONFIRMADO.**

Linha 293 do `build-import-prompt.ts`:
```
"**Laudo Dr. [Nome] - [Especialidade] (DD/MM/AAAA):**"
```

O exemplo no prompt usa `**` que instrui a IA a aplicar negrito markdown dentro da string JSON.

**A sugestão do Gem está correta:** substituir por formato de texto limpo como:
```
LAUDO 1
Data: DD/MM/AAAA
Médico: Dr. Nome - Especialidade
```

**Problema adicional que o Gem não viu:** o footer já diz "sem markdown", mas o exemplo no mesmo prompt mostra markdown. A IA vai seguir o exemplo concreto, não a regra abstrata. **A contradição interna é o bug verdadeiro.**

---

### 3. `prompt_import_examesComplementares` — Markdown no exemplo

**Veredicto: PROBLEMA REAL E CONFIRMADO.**

Linha 310 do `build-import-prompt.ts`:
```
Exemplo: "**RNM Coluna Lombar (15/03/2023):** Protrusão discal L4-L5..."
```

Mesmo problema: exemplo com `**` contradiz o footer que proíbe markdown.

**A sugestão do Gem está correta:** substituir por:
```
EXAME 1
Tipo e Região: RNM Coluna Lombar
Data: 15/03/2023
Resultados: Protrusão discal L4-L5...
```

---

### 4. `prompt_import_quesitos` — Markdown no cabeçalho do prompt

**Veredicto: PROBLEMA REAL, mas de natureza diferente do que o Gem diagnosticou.**

Linha 393 do `build-import-prompt.ts`:
```
`**EXTRAÇÃO INTEGRAL OBRIGATÓRIA** - Os quesitos são...`
```

Aqui os `**` estão no **corpo do prompt em si** (instrução para a IA), não no exemplo do formato de saída. Isso **não causa quebra de JSON** — a IA lê o prompt como instrução, não como template de resposta.

**O risco real dos quesitos** é outro: a instrução menciona "numeração original (1, 2, 3... ou I, II, III... ou a, b, c...)" mas não proíbe explicitamente bullets markdown na saída. A IA pode interpretar listas numeradas como `1. Pergunta` (válido em texto puro) ou como markdown complexo.

**O que o Gem sugeriu** (texto puro, cada quesito em nova linha) é a abordagem mais segura, mas por razão diferente da que ele diagnosticou.

---

### 5. `prompt_import_tratamentos` — "ESTRUTURE em lista"

**Veredicto: PROBLEMA REAL E CONFIRMADO.**

Linha 222 do `build-import-prompt.ts`:
```
"ESTRUTURE em lista quando possível. Seja específico com datas e resultados."
```

A expressão "em lista" é ambígua e pode levar a IA a usar `- item` ou `* item` (markdown) em vez de texto plano.

No `defaultSystemPrompt` da linha 185:
```
"ESTRUTURE em lista quando possível."
```

Mesma instrução problemática no fallback monolítico.

**A sugestão do Gem está correta:** substituir "ESTRUTURE em lista" por "Separe cada tratamento com uma quebra de linha."

**Mas o Gem errou na abrangência:** o mesmo problema existe no `defaultSystemPrompt` (o fallback) que também precisa ser corrigido para consistência. Os prompts no banco são usados quando existem; o fallback monolítico entra quando o banco falha.

---

### 6. `prompt_import_historicoOcupacional` e `prompt_import_historiaAcidente`

**Veredicto: PROBLEMA MENOR (asteriscos na instrução, não no exemplo de saída).**

Linhas 154 e 167:
```
`**EXTRAÇÃO OBRIGATÓRIA** - Liste CRONOLOGICAMENTE...`
`**EXTRAÇÃO DETALHADA OBRIGATÓRIA** - Extraia e detalhe...`
```

Os asteriscos estão no cabeçalho da instrução, não no exemplo de saída. Isso **não causa quebra de JSON diretamente** — a IA vê como ênfase na instrução.

**Porém:** alguns modelos podem "espelhar" a formatação que veem nas instruções para a resposta. É uma boa prática eliminar os asteriscos das instruções também. Baixo risco, mas correção válida.

---

## O QUE O GEM NÃO VIU — PROBLEMAS REAIS NO CÓDIGO

### Problema A: `ESTRUTURE em lista` está no fallback monolítico também

O `defaultSystemPrompt` (linha 185 do `processar-autos/index.ts`) tem:
```
"ESTRUTURE em lista quando possível."
```

O Gem só analisou os prompts do banco. O fallback monolítico tem o mesmo problema e o Gem não o identificou. **Ambos precisam ser corrigidos.**

### Problema B: O `IMPORT_PROMPT_HEADER` também tem a instrução 4 ambígua

No `build-import-prompt.ts` linha 28:
```
"4. Estruture as informações em tópicos/listas quando apropriado para maior clareza."
```

Isso está no **header global** que precede todos os prompts modulares. Contradiz diretamente o footer que proíbe markdown. **Mesma instrução existe no `defaultSystemPrompt` linha 35.**

Esta é a contradição mais grave: o header diz "use listas", o footer diz "sem markdown, JSON puro". A IA tem sinal conflitante a cada importação.

### Problema C: Chave técnica inexistente sugerida pelo Gem

O Gem sugeriu `prompt_import_system` como nova chave. Esta chave **não existe** no sistema e criá-la não teria efeito, pois o header/footer são constantes hardcoded no código, não prompts do banco. A sugestão seria inútil se implementada.

---

## RESUMO — O QUE FAZER E O QUE NÃO FAZER

```text
CONFIRMADO — Implementar:
  A. Remover "**" dos exemplos de formato em laudosMedicos e examesComplementares
  B. Substituir "ESTRUTURE em lista quando possível" por "Separe com quebra de linha"
     → Nos prompts do banco (build-import-prompt.ts defaults)
     → No fallback monolítico (defaultSystemPrompt no processar-autos/index.ts)
  C. Corrigir o IMPORT_PROMPT_HEADER: remover/ajustar item 4 que contradiz o footer
  D. Remover "**EXTRAÇÃO OBRIGATÓRIA**" dos cabeçalhos dos prompts individuais

DESCARTAR — Não implementar:
  X. Criar chave prompt_import_system — não tem efeito, sistema usa constantes
  X. Reescrever o footer anti-markdown — já existe e está correto
```

---

## PLANO TÉCNICO DE IMPLEMENTAÇÃO

### Arquivos a alterar: 2

**Arquivo 1: `supabase/functions/_shared/build-import-prompt.ts`**

Alterações nos DEFAULT_IMPORT_PROMPTS:

1. `prompt_import_historicoOcupacional` (linha 154): remover `**EXTRAÇÃO OBRIGATÓRIA**`
2. `prompt_import_historiaAcidente` (linha 167): remover `**EXTRAÇÃO DETALHADA OBRIGATÓRIA**`
3. `prompt_import_laudosMedicos` (linhas 291–297): substituir o exemplo com `**` por formato de texto limpo (LAUDO 1 / Data: / Médico:)
4. `prompt_import_examesComplementares` (linhas 309–311): substituir o exemplo com `**RNM...` por formato EXAME 1 / Tipo e Região: / Data: / Resultados:
5. `prompt_import_tratamentos` (linha 222): substituir "ESTRUTURE em lista quando possível" por "Separe cada tratamento com uma quebra de linha."
6. `prompt_import_quesitos` (linha 393): remover `**EXTRAÇÃO INTEGRAL OBRIGATÓRIA**`

Alteração no IMPORT_PROMPT_HEADER:

7. Linha 28: substituir `"4. Estruture as informações em tópicos/listas quando apropriado para maior clareza."` por `"4. Use APENAS texto plano nas respostas. Separe itens com quebras de linha. NUNCA use formatação Markdown (asteriscos, negritos, bullets) dentro dos valores JSON."`

**Arquivo 2: `supabase/functions/processar-autos/index.ts`**

Alterações no `defaultSystemPrompt` (fallback monolítico):

8. Linha 35 (regra 4): mesma correção do item 7 acima
9. Linha 185: substituir "ESTRUTURE em lista quando possível" por "Separe cada tratamento com uma quebra de linha."
10. Linha 211–215: substituir exemplo `**Laudo Dr...` por formato texto limpo
11. Linha 224: substituir exemplo `**RNM Coluna Lombar...` por formato texto limpo

**IMPORTANTE:** As alterações nos `DEFAULT_IMPORT_PROMPTS` afetam apenas o comportamento na **primeira vez que o prompt é auto-registrado** no banco, ou quando o usuário usar "Restaurar Padrão de Fábrica". Prompts que **já estão salvos no banco** com os exemplos markdown antigos precisam ser atualizados via "Restaurar Padrão de Fábrica" no DevPanel após o deploy.

Após o deploy, o administrador deve acessar DevPanel > Prompts IA e usar "Restaurar Padrão de Fábrica" nos cards `exame` (laudos médicos, exames complementares) e `periciando` (histórico ocupacional, história do acidente, tratamentos) para aplicar os novos defaults ao banco.


# Atualização Cirúrgica dos 6 Prompts no Banco de Dados

## O que foi confirmado no banco

Consultei o banco agora e todos os 6 prompts existem com os valores antigos. Os problemas confirmados são:

- `prompt_import_laudosMedicos` → tem `**Laudo Dr. [Nome]**` e bullets markdown na saída de exemplo
- `prompt_import_examesComplementares` → tem `**RNM Coluna Lombar...**` no exemplo
- `prompt_import_tratamentos` → tem "ESTRUTURE em lista quando possível"
- `prompt_import_historicoOcupacional` → instrução ambígua com formato de lista bullet
- `prompt_import_historiaAcidente` → instrução ambígua com formato de lista bullet  
- `prompt_import_quesitos` → instrução adequada, mas falta proibição explícita de markdown na saída

## Como será feito — com segurança total

Usarei `UPDATE` no banco com o `id` exato de cada registro. A estrutura JSONB de cada prompt será preservada integralmente (todos os campos: `cardId`, `sectionId`, `order`, `variables`, `isClassified`, `description`). Apenas o campo `prompt` dentro do JSONB será substituído.

Nenhum outro registro será tocado.

## Correções exatas por prompt

### 1. `prompt_import_laudosMedicos`
**Remove:** Exemplo com `**Laudo Dr. [Nome]**` e bullets `- Diagnósticos:`  
**Substitui por:** Formato de texto limpo estruturado em blocos LAUDO 1 / LAUDO 2

### 2. `prompt_import_examesComplementares`
**Remove:** Exemplo `**RNM Coluna Lombar (15/03/2023):**`  
**Substitui por:** Formato EXAME 1 / Tipo e Região / Data / Resultados / Conclusão

### 3. `prompt_import_tratamentos`
**Remove:** "ESTRUTURE em lista quando possível."  
**Substitui por:** "Separe cada tratamento com uma quebra de linha dupla. NÃO use marcadores markdown (traços, asteriscos ou bullets)."

### 4. `prompt_import_historicoOcupacional`
**Ajusta:** Instrução de bullets `- Nome da empresa` para texto estruturado com quebras de linha explícitas, proibindo markdown

### 5. `prompt_import_historiaAcidente`
**Ajusta:** Instrução de bullets `- data:` para campos em texto plano com quebras de linha, sem marcadores

### 6. `prompt_import_quesitos`
**Adiciona:** Instrução explícita ao final: "Exiba cada quesito em uma nova linha de texto simples, SEM formatação markdown. NÃO use bullets, traços ou asteriscos."

## O que NÃO será alterado

- Nenhum campo de metadados (`cardId`, `sectionId`, `order`, `isClassified`, `description`, `variables`)
- Nenhum outro prompt além dos 6 listados
- Nenhum arquivo de código (os defaults no código já foram corrigidos no deploy anterior)
- Nenhuma tabela além de `system_config`

## Resultado esperado

Na próxima importação de PDF, os campos Laudos Médicos, Exames Complementares, Tratamentos, Histórico Ocupacional, História do Acidente e Quesitos virão em texto plano limpo, sem asteriscos ou bullets markdown — consistentes com as regras do header e footer que já proibem markdown globalmente.

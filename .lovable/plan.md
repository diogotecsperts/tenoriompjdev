## Diagnóstico

1. **Reverter após concluir**
   - Hoje o botão `Concluir perícia` muda o status diretamente para `concluido`.
   - Depois disso o botão fica desabilitado e não há ação para voltar ao status anterior.
   - A tabela atual só guarda `status`; não há histórico persistido do status anterior. Para não criar migração desnecessária, a forma mais segura é reverter para o status operacional anterior esperado: `em_atendimento`.

2. **Escolaridade não marca no app nem no DOCX/PDF**
   - A cadeia de exportação já está preparada: se `prelaudo_data.identificacao.escolaridade` estiver preenchido, DOCX/PDF marcam a opção correta.
   - No caso atual aberto, o banco mostra:
     - `prev_extracao.identificacao.escolaridade = ""`
     - `prelaudo_data.identificacao.escolaridade = null`
   - Portanto o problema não está principalmente no exportador: a IA não extraiu a escolaridade neste PDF e o merge não tem fallback para tentar achar escolaridade em outros trechos estruturados/documentos quando o campo vem vazio.

## Plano de implementação

### 1. Adicionar reversão segura do status concluído

- No editor previdenciário, quando a perícia estiver `concluido`, trocar o botão desabilitado por uma ação ativa: **Reabrir perícia**.
- Ao clicar, salvar alterações pendentes e alterar o status para `em_atendimento`.
- Atualizar o badge/status local imediatamente após sucesso.
- Exibir toast de confirmação: “Perícia reaberta”.
- Manter o fluxo isolado no módulo Previdenciário, sem tocar no Trabalhista.

### 2. Corrigir escolaridade com fallback defensivo local

- Fortalecer `mergeFromExtracao` para tentar preencher escolaridade quando `identificacao.escolaridade` vier vazio.
- A busca será feita apenas em campos já extraídos pela IA, sem reler PDF e sem inventar:
  - `historia_clinica`
  - `historia_laboral`
  - `documentos[].resumo`
  - outros textos estruturados simples do `prev_extracao`
- Criar um helper de detecção com padrões explícitos, por exemplo:
  - `analfabeto`, `sem instrução`
  - `fundamental incompleto/completo`, `primário`, `1º grau`, `8ª série`, `9ª série`
  - `médio incompleto/completo`, `2º grau`, `colegial`, `ensino técnico`
  - `superior incompleto/completo`, `graduação`, `universitário`
- Só preencher quando houver menção textual clara. Se não houver, continuará vazio.

### 3. Corrigir escolaridade na edge function para próximos processamentos

- Adicionar normalização defensiva também dentro de `prev-pre-processar`, logo após o JSON da IA:
  - se `parsed.identificacao.escolaridade` vier com sinônimo, normalizar para um dos rótulos oficiais;
  - se vier vazio, tentar fallback nos próprios textos estruturados retornados pela IA;
  - se continuar sem evidência clara, deixar vazio.
- Isso melhora novos uploads/reprocessamentos sem depender só do frontend.

### 4. Garantir que documentos exportados recebam a correção

- Como DOCX/PDF já usam `buildOptionRows(ESCOLARIDADE_OPCOES, id.escolaridade, id.escolaridade_outros)`, a correção passa a aparecer automaticamente quando o dado for preenchido.
- Não alterar a estrutura visual do DOCX/PDF além disso.

### 5. Tratar o laudo atualmente aberto

- Como o PDF atual já foi processado e salvou escolaridade vazia, a correção automática só aparecerá ao:
  - reabrir o editor após o patch, se o fallback encontrar escolaridade nos dados já salvos; ou
  - reprocessar o PDF, caso a informação exista apenas no OCR bruto e não tenha ficado em nenhum campo estruturado salvo.
- Não farei atualização retroativa manual no banco sem pedido expresso, preservando a regra de integridade de dados.

## Validação

- Verificar que uma perícia `concluido` mostra botão **Reabrir perícia** e volta para `em_atendimento`.
- Verificar que escolaridade detectada aparece selecionada no Step 1.
- Verificar que DOCX/PDF marcam a escolaridade no formato `(X)`.
- Confirmar que os ajustes ficam restritos ao módulo Previdenciário.
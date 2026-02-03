
# Atualização em Lote: 8 Prompts Otimizados

## Resumo da Operação

Aplicar **UPDATE direto no banco de dados** para 8 prompts existentes, seguindo as instruções de otimização fornecidas. Após testes bem-sucedidos, os prompts poderão ser tornados permanentes no código-fonte.

---

## Prompts a Atualizar

| # | ID no Banco | Seção | Tipo |
|---|-------------|-------|------|
| 1 | `prompt_regen_descricaoAtividadesLaborais` | Dados do Posto de Trabalho | Regerar |
| 2 | `prompt_regen_laudosMedicos` | Exame Clínico | Regerar |
| 3 | `prompt_gen_descricao_doencas` | Análise Técnica - Descrição CID | Gerar |
| 4 | `prompt_gen_nexo_causal` | Análise Técnica - Nexo Causal | Gerar |
| 5 | `prompt_gen_incapacidade` | Análise da Incapacidade | Gerar |
| 6 | `prompt_gen_referencias` | Referências Bibliográficas | Gerar |
| 7 | `prompt_regen_quesitosReclamante` | Quesitos do Reclamante | Regerar |
| 8 | `prompt_regen_quesitosReclamada` | Quesitos da Reclamada | Regerar |

---

## SQL para Cada Prompt

### 1. Dados do Posto de Trabalho (Fusão Ambiente + Atividades)

```sql
UPDATE system_config 
SET value = jsonb_set(
  value,
  '{prompt}',
  '"Você é um perito em ergonomia. Extraia do PDF e detalhe em um campo único a \"Descrição das Atividades Laborais\".\n\nO QUE EXTRAIR COM RIGOR:\n\n1. AMBIENTE E POSTO:\nLayout, mobiliário, equipamentos utilizados e condições ambientais (ruído, temperatura).\n\n2. DINÂMICA DA TAREFA:\nMovimentos repetitivos, pesos manipulados (em kg), posturas predominantes (sentado/em pé) e jornada de trabalho.\n\n3. ANÁLISE DE RISCO:\nIdentifique a exposição a riscos físicos e químicos mencionados no PPRA/PGR ou PPP.\n\nREGRA DE OURO: Não separe ambiente de função. Crie um texto fluido e técnico que descreva ONDE e COMO o trabalho era realizado. Mínimo 2 parágrafos."'
),
updated_at = now()
WHERE id = 'prompt_regen_descricaoAtividadesLaborais';
```

### 2. Laudos Médicos (Exclusão de Exames de Imagem)

```sql
UPDATE system_config 
SET value = jsonb_set(
  value,
  '{prompt}',
  '"Extraia os pareceres de médicos assistentes do PDF.\n\nREGRA DE EXCLUSÃO: Ignore descrições puras de exames de imagem (RNM, TC, Raio-X) para evitar duplicidade com o campo de Exames Complementares.\n\nFOQUE EM:\n- Data e especialidade do médico\n- Diagnósticos (CID-10) e conclusões clínicas\n- Recomendações de afastamento ou restrições definitivas\n\nESTRUTURA DE SAÍDA:\nListe individualmente cada laudo no formato:\n\nLAUDO DR. [NOME] ([ESPECIALIDADE]) - DD/MM/AAAA:\n[Conclusão clínica e restrições recomendadas]\n\nSepare cada laudo com uma linha em branco."'
),
updated_at = now()
WHERE id = 'prompt_regen_laudosMedicos';
```

### 3. Descrição Técnica de Doenças (CIDs)

```sql
UPDATE system_config 
SET value = jsonb_set(
  jsonb_set(
    value,
    '{prompt}',
    '"Você é um médico enciclopedista. Para o(s) CID(s) inserido(s), forneça uma descrição técnica completa.\n\nCÓDIGOS CID A DESCREVER:\n${cids}\n\nCONTEXTO OCUPACIONAL (se disponível):\n- Atividades laborais: ${atividadesLaborais}\n- Histórico ocupacional: ${historicoOcupacional}\n\nPARA CADA CID, FORNEÇA:\n\n1. NOME COMPLETO E CID-10\nExemplo: TENDINITE DO SUPRAESPINHOSO (CID-10: M75.1)\n\n2. DEFINIÇÃO TÉCNICA\nDescreva tecnicamente o que é a patologia, localização anatômica e características principais.\n\n3. ETIOLOGIA\nOrigem da doença - causas possíveis incluindo fatores ocupacionais.\n\n4. SINTOMATOLOGIA CLÁSSICA\nSintomas típicos da condição.\n\n5. RELAÇÃO OCUPACIONAL TÍPICA\nSe é uma DORT/LER comum em certas funções, ou outros vínculos ocupacionais conhecidos.\n\nFORMATAÇÃO:\n- Use CAIXA ALTA para títulos (não use markdown com asteriscos)\n- Retorne apenas o texto técnico para ser anexado ao campo\n- Linguagem formal e científica\n- Mínimo 2 parágrafos por CID"'
  ),
  '{variables}',
  '["cids", "atividadesLaborais", "historicoOcupacional"]'
),
updated_at = now()
WHERE id = 'prompt_gen_descricao_doencas';
```

### 4. Nexo Causal (Schilling, Simonin, Bradford-Hill)

```sql
UPDATE system_config 
SET value = jsonb_set(
  jsonb_set(
    value,
    '{prompt}',
    '"Você é médico-perito judicial. Gere a análise de NEXO CAUSAL / CONCAUSALIDADE em linguagem técnica absoluta.\n\nDADOS DO CASO:\n- CIDs: ${cids}\n- Atividades Laborais: ${atividadesLaborais}\n- História do Acidente/Doença: ${historiaAcidente}\n- Exame Físico: ${exameFisico}\n- Exames Complementares: ${examesComplementares}\n- Antecedentes: ${antecedentes}\n- Laudos Médicos: ${laudosMedicos}\n\nCRITÉRIOS OBRIGATÓRIOS DE ANÁLISE:\n\n1. CLASSIFICAÇÃO DE SCHILLING:\nEnquadre obrigatoriamente no Grupo I, II ou III:\n- Grupo I: Trabalho é causa necessária (doenças profissionais típicas)\n- Grupo II: Trabalho é fator contributivo (doenças do trabalho)\n- Grupo III: Trabalho é provocador de distúrbio latente\nJustifique com os dados de atividades laborais e história.\n\n2. CRITÉRIOS DE SIMONIN:\nAnalise a coerência entre:\n- Topografia da lesão\n- Cronologia dos fatos\n- Mecanismo de trauma/exposição\n\n3. CRITÉRIOS DE BRADFORD-HILL:\nAvalie e declare se cada critério é atendido (SIM/NÃO/PARCIAL):\n- Plausibilidade biológica\n- Temporalidade\n- Consistência\n\n4. ANÁLISE ANAMT:\nSe houver ASO/PCMSO nos laudos médicos, comente se a documentação ocupacional é suficiente para a análise.\n\nREGRA: Se faltar dado essencial, declare \"informação insuficiente nos autos\".\n\nCONCLUSÃO OBRIGATÓRIA:\nFinalize com: \"NEXO CAUSAL: [PRESENTE/AUSENTE/INCONCLUSIVO]\" seguido de justificativa técnica em 2-3 linhas."'
  ),
  '{variables}',
  '["cids", "atividadesLaborais", "historiaAcidente", "exameFisico", "examesComplementares", "antecedentes", "laudosMedicos"]'
),
updated_at = now()
WHERE id = 'prompt_gen_nexo_causal';
```

### 5. Análise da Incapacidade Laboral

```sql
UPDATE system_config 
SET value = jsonb_set(
  jsonb_set(
    value,
    '{prompt}',
    '"Redija a análise de incapacidade laboral fundamentada tecnicamente.\n\nDADOS DO CASO:\n- CIDs: ${cids}\n- Atividades Laborais: ${atividadesLaborais}\n- Exame Físico: ${exameFisico}\n- Exames Complementares: ${examesComplementares}\n- Antecedentes: ${antecedentes}\n- Nexo Causal: ${nexoCausal}\n\nESTRUTURA OBRIGATÓRIA DE RESPOSTA:\n\n1. DEMANDAS CRÍTICAS DO CARGO:\nResuma 3-6 demandas físicas/cognitivas do cargo baseadas nas atividades laborais informadas.\n\n2. ACHADOS OBJETIVOS:\nCorrelacione os achados do exame físico e exames complementares com o(s) diagnóstico(s).\n\n3. LIMITAÇÕES FUNCIONAIS:\nListe objetivamente o que o periciando NÃO consegue realizar.\nExemplos:\n- \"Incapaz de elevação do membro superior acima de 90°\"\n- \"Incapaz de permanecer em pé por mais de 30 minutos\"\n- \"Incapaz de manipular cargas acima de 5kg\"\n\n4. CLASSIFICAÇÃO DA INCAPACIDADE:\n- GRAU: Parcial ou Total\n- DURAÇÃO: Temporária ou Permanente\n- EXTENSÃO: Para a função habitual ou para toda atividade laborativa\n\nNOTA TÉCNICA: Utilize os critérios de Schilling e Simonin para fundamentar o peso do trabalho na incapacidade atual, se aplicável."'
  ),
  '{variables}',
  '["cids", "atividadesLaborais", "exameFisico", "examesComplementares", "antecedentes", "nexoCausal"]'
),
updated_at = now()
WHERE id = 'prompt_gen_incapacidade';
```

### 6. Referências Bibliográficas (Fixas + Condicionais)

```sql
UPDATE system_config 
SET value = jsonb_set(
  jsonb_set(
    value,
    '{prompt}',
    '"Gere as referências bibliográficas pertinentes ao laudo pericial.\n\nDADOS DO CASO:\n- CIDs: ${cids}\n- Atividades Laborais: ${atividadesLaborais}\n- Laudos Médicos: ${laudosMedicos}\n\nREFERÊNCIAS OBRIGATÓRIAS (SEMPRE INCLUIR):\n\n1. SCHILLING, R. S. F. More effective prevention in occupational health practice? Journal of the Society of Occupational Medicine, v. 39, p. 71-79, 1989.\n\n2. BRADFORD HILL, A. The environment and disease: association or causation? Proceedings of the Royal Society of Medicine, v. 58, p. 295-300, 1965.\n\n3. SIMONIN, C. Medicina Legal Judicial. 2. ed. Barcelona: Editorial JIMS, 1962.\n\nREFERÊNCIA CONDICIONAL:\nInclua a referência da ANAMT (Associação Nacional de Medicina do Trabalho) APENAS se houver menção a ASO, PCMSO ou documentação ocupacional nos laudos médicos.\n\nREFERÊNCIAS DINÂMICAS:\nAdicione 2 a 4 referências científicas reais e pertinentes aos CIDs específicos do caso. Busque artigos, diretrizes ou livros-texto reconhecidos.\n\nFORMATO OBRIGATÓRIO: ABNT (NBR 6023)\nExemplo:\nSOBRENOME, Nome. Título da obra. Edição. Cidade: Editora, Ano."'
  ),
  '{variables}',
  '["cids", "atividadesLaborais", "laudosMedicos"]'
),
updated_at = now()
WHERE id = 'prompt_gen_referencias';
```

### 7. Quesitos do Reclamante (Formatação Corrigida)

```sql
UPDATE system_config 
SET value = jsonb_set(
  value,
  '{prompt}',
  '"Extraia do PDF os quesitos formulados pelo RECLAMANTE e suas respostas.\n\nESTRUTURA DE EXTRAÇÃO:\n- Identifique a seção de quesitos do reclamante/autor\n- Extraia cada pergunta na íntegra\n- Se houver respostas do perito, inclua-as\n\nFORMATO DE SAÍDA:\n\nQUESITO 1: [Texto completo da pergunta]\nRESPOSTA: [Resposta do perito, se disponível, ou \"Aguardando resposta\"]\n\nQUESITO 2: [Texto completo da pergunta]\nRESPOSTA: [Resposta do perito, se disponível, ou \"Aguardando resposta\"]\n\n[Continuar para todos os quesitos]\n\nREGRA DE FORMATAÇÃO OBRIGATÓRIA:\nÉ PROIBIDO agrupar quesitos. Exiba CADA pergunta em uma nova linha, mantendo a numeração original (1., 2., 3., etc.).\n\nSe não houver quesitos do reclamante no documento, retorne: \"Não foram localizados quesitos do reclamante nos autos.\""'
),
updated_at = now()
WHERE id = 'prompt_regen_quesitosReclamante';
```

### 8. Quesitos da Reclamada (Formatação Corrigida)

```sql
UPDATE system_config 
SET value = jsonb_set(
  value,
  '{prompt}',
  '"Extraia do PDF os quesitos formulados pela RECLAMADA e suas respostas.\n\nESTRUTURA DE EXTRAÇÃO:\n- Identifique a seção de quesitos da reclamada/ré\n- Extraia cada pergunta na íntegra\n- Se houver respostas do perito, inclua-as\n\nFORMATO DE SAÍDA:\n\nQUESITO 1: [Texto completo da pergunta]\nRESPOSTA: [Resposta do perito, se disponível, ou \"Aguardando resposta\"]\n\nQUESITO 2: [Texto completo da pergunta]\nRESPOSTA: [Resposta do perito, se disponível, ou \"Aguardando resposta\"]\n\n[Continuar para todos os quesitos]\n\nREGRA DE FORMATAÇÃO OBRIGATÓRIA:\nÉ PROIBIDO agrupar quesitos. Exiba CADA pergunta em uma nova linha, mantendo a numeração original (1., 2., 3., etc.).\n\nSe não houver quesitos da reclamada no documento, retorne: \"Não foram localizados quesitos da reclamada nos autos.\""'
),
updated_at = now()
WHERE id = 'prompt_regen_quesitosReclamada';
```

---

## Sequência de Execução

1. Executar os 8 UPDATEs no banco de dados
2. As mudanças serão **imediatamente visíveis** na página "Prompts IA"
3. Testar cada funcionalidade no editor de laudos
4. Após validação do cliente, tornar permanente no código-fonte

---

## Observações Técnicas

- **Variáveis de interpolação**: Os prompts de geração usam `${variavel}` que serão substituídas pelo contexto do laudo
- **Retrocompatibilidade**: Se clicar em "Restaurar Padrão de Fábrica", os prompts voltarão à versão do código (atual)
- **Prompts de Regerar**: Não usam variáveis pois recebem o PDF diretamente
- **Prompts de Gerar**: Usam variáveis do contexto do laudo atual

---

## Pendente para Próxima Etapa

O prompt `prompt_gen_metodologia` será tratado separadamente, pois precisa ser criado no código-fonte para ser reconhecido pelo sistema.

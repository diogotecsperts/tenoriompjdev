
## Auditoria e Correção dos Prompts de Regeneração (REGEN)

### Contexto Técnico para o Gemini

**Diferença arquitetural crítica entre IMPORT e REGEN:**

O sistema de IMPORT (`processar-autos`) possui uma camada de proteção global em `supabase/functions/_shared/build-import-prompt.ts` que injeta um header/footer de formatação em torno de todos os prompts individuais. Isso significa que, mesmo que um prompt import individual contenha exemplos em Markdown, o wrapper global pode mitigar parcialmente o efeito.

O sistema de REGEN (`regerar-campo-pdf/index.ts`) **não possui esse wrapper global**. O system prompt fixo usado em ambos os caminhos de execução (bucket e fallback) é apenas: `"Você é um assistente especializado em extração de dados de documentos médicos e jurídicos. Extraia apenas as informações solicitadas, sem inventar dados."` — sem nenhuma instrução de formato. Isso torna cada prompt REGEN individualmente a única barreira contra Markdown.

---

### Diagnóstico por Prompt (do banco de dados)

**RISCO ALTO — Requer correção cirúrgica imediata:**

- `prompt_regen_laudosMedicos`: Contém exemplos explícitos de saída em Markdown: `**Laudo Dr. [Nome] - [Especialidade] (DD/MM/AAAA):**` com sub-bullets `- Diagnósticos:`, `- Conclusões:`. É um molde de saída em negrito que o modelo copiará fielmente.

- `prompt_regen_examesComplementares`: Contém `**[Tipo do Exame] - [Região] (DD/MM/AAAA):**` e um exemplo real de saída: `"**RNM Coluna Lombar (15/03/2023):**"` — duplo vetor de risco: template + exemplo concreto.

**RISCO MÉDIO — Presença de bullets instrutivos que podem contaminar saída:**

- `prompt_regen_afastamentos`: Usa `*` (asteriscos como bullets) nos sub-itens de tipos de benefício (B31, B91, etc.). Com Mistral como fallback, há risco real de esses asteriscos serem interpretados como formatação Markdown na saída.

- `prompt_regen_auxilioTerceiros`: Usa `*` nos sub-itens das AVDs (Alimentar-se, Vestir-se, etc.). A saída final é pedida em prosa, mas os bullets instrutivos podem contaminar.

- `prompt_regen_danoEstetico`: Usa `-` na seção de classificação. A saída é pedida em prosa, mas os tracejados na instrução são um vetor.

**RISCO BAIXO — Sem Markdown confirmado, mas na lista de vigilância:**

- `prompt_regen_antecedentes`, `prompt_regen_historiaAtual`, `prompt_regen_historicoOcupacional`, `prompt_regen_historiaAcidente`, `prompt_regen_tratamentos`, `prompt_regen_conclusaoAnalise`, `prompt_regen_tabelaSUSEP`, `prompt_regen_exameFisico`, `prompt_regen_descricaoAtividadesLaborais`, `prompt_regen_quesitosJuizo`, `prompt_regen_quesitosReclamante`, `prompt_regen_quesitosReclamada` — Contêm bullets como instruções lógicas de extração (o que é correto), mas sem exemplos de saída formatada. Receberão apenas a trava de segurança no final.

---

### Concordância/Discordância com as Recomendações do Gemini

**Concordo integralmente:**
- A recomendação de auditar os prompts REGEN é correta e necessária.
- A identificação de que `laudosMedicos` e `examesComplementares` são os mais urgentes está alinhada com o que encontrei no banco.
- A observação preventiva sobre prompts com "LISTE em formato estruturado" é válida — risco real especialmente com Mistral.

**Discordância técnica em um ponto (informação interna):**
- O Gemini tratou REGEN e IMPORT como equivalentes em termos de exposição. Eles não são. IMPORT tem proteção sistêmica via wrapper global; REGEN não tem. Isso eleva a prioridade dos prompts REGEN em relação ao que foi avaliado. O risco dos REGENs é estruturalmente maior.

---

### O que será feito (5 operações cirúrgicas no banco)

**Operação 1 — `prompt_regen_laudosMedicos` (ALTO)**
Substituir o bloco `ESTRUTURE ASSIM: **Laudo Dr. [Nome]...**` por formato plano:
```
ESTRUTURE ASSIM (sem negrito, sem traços, sem asteriscos):
LAUDO 1
Data: [DD/MM/AAAA]
Médico: [Nome] - [Especialidade]
Diagnósticos: [listar com CIDs]
Conclusões: [descrever]
Recomendações: [descrever]
Limitações: [descrever]

NÃO use marcadores markdown (asteriscos, negrito, traços, bullets).
```

**Operação 2 — `prompt_regen_examesComplementares` (ALTO)**
Substituir o bloco `ESTRUTURE ASSIM: **[Tipo do Exame]...**` e o exemplo concreto com `**RNM...**` por:
```
ESTRUTURE ASSIM (sem negrito, sem traços, sem asteriscos):
EXAME 1
Tipo: [tipo e região]
Data: [DD/MM/AAAA]
Achados: [descrição completa]
Conclusão: [conclusão do exame]

NÃO use marcadores markdown (asteriscos, negrito, traços, bullets).
```

**Operação 3 — `prompt_regen_afastamentos` (MÉDIO)**
Adicionar ao final: `NÃO use marcadores markdown (asteriscos ou traços) na resposta.`

**Operação 4 — `prompt_regen_auxilioTerceiros` (MÉDIO)**
Adicionar ao final: `NÃO use marcadores markdown (asteriscos ou traços) na resposta.`

**Operação 5 — `prompt_regen_danoEstetico` (MÉDIO)**
Adicionar ao final: `NÃO use marcadores markdown (asteriscos ou traços) na resposta.`

---

### O que NÃO será alterado e por quê

Os prompts de risco baixo (antecedentes, historiaAtual, historicoOcupacional, etc.) contêm bullets exclusivamente como **instruções de raciocínio para a IA** (o que buscar, onde olhar), não como moldes de saída. Alterar esses bullets quebraria a clareza instrucional sem ganho de segurança proporcional. Eles permanecem na lista de vigilância para correção se houver reclamação de campo específico.

Os prompts de quesitos (`quesitosJuizo`, `quesitosReclamante`, `quesitosReclamada`) usam numeração (1. 2. 3.) que é intencional — os quesitos originais já vêm numerados do processo judicial e devem ser preservados literalmente.

---

### Arquitetura Técnica das Alterações

Todas as alterações serão feitas diretamente no banco via `jsonb_set` (mesmo método usado nas correções IMPORT), modificando apenas o campo `prompt` dentro do JSONB sem tocar em `cardId`, `sectionId`, `order`, `createdAt` ou outros metadados. Nenhum arquivo de código será alterado.

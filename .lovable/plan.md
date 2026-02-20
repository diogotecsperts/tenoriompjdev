
## Diagnóstico: O que foi feito e o que ainda está pendente

### Status Atual — 3 Camadas de Proteção, Apenas 1 Corrigida

O sistema REGEN possui **três camadas** de defesa contra Markdown. A auditoria anterior corrigiu apenas a primeira. As duas camadas mais profundas ainda estão vulneráveis.

---

### Camada 1 — Prompts no Banco de Dados (system_config) — CORRIGIDA

Todas as 5 operações cirúrgicas foram executadas via `jsonb_set`:
- `prompt_regen_laudosMedicos`: reestruturado para formato plano (LAUDO 1 / Data / Médico)
- `prompt_regen_examesComplementares`: removidos templates bold e exemplo `**RNM...**`
- `prompt_regen_afastamentos`, `auxilioTerceiros`, `danoEstetico`: trava `NÃO use marcadores markdown` adicionada ao final

Esse é o caminho padrão de execução — quando a função vai ao banco via `getPrompt()` para recuperar o prompt customizado.

---

### Camada 2 — System Prompt da Edge Function (hardcoded no `callAI`) — PENDENTE

**Esta é exatamente a recomendação que o Gemini indicou e que ainda NÃO foi implementada.**

Há dois pontos de chamada `callAI` na função, ambos com o mesmo system prompt vulnerável:

**Linha 514** (caminho bucket / two-phase):
```
'Você é um assistente especializado em extração de dados de documentos médicos e jurídicos. Extraia apenas as informações solicitadas, sem inventar dados.'
```

**Linha 651** (caminho fallback / cache):
```
'Você é um assistente especializado em extração de dados de documentos médicos e jurídicos. Extraia apenas as informações solicitadas, sem inventar dados.'
```

Nenhum dos dois contém qualquer instrução de formatação. Esta é a "Camada 2" recomendada pelo Gemini que ainda não foi criada.

---

### Camada 3 — Fallback Hardcoded (`fieldPrompts` no próprio arquivo) — PENDENTE

Existe um objeto `fieldPrompts` no código (linhas 39–360) que atua como fallback quando `getPrompt()` falha ao consultar o banco. Dois deles ainda contêm Markdown explícito:

**Linha 143–148** (`laudosMedicos` — fallback):
```
ESTRUTURE ASSIM:
**Laudo Dr. [Nome] - [Especialidade] (DD/MM/AAAA):**
- Diagnósticos: [listar com CIDs]
- Conclusões: [descrever]
```

**Linha 161–165** (`examesComplementares` — fallback):
```
**[Tipo do Exame] - [Região] (DD/MM/AAAA):**
...
Exemplo: "**RNM Coluna Lombar (15/03/2023):**..."
```

Os prompts do banco foram corrigidos, mas se por algum motivo a consulta ao `system_config` falhar (timeout, erro de rede, chave não encontrada), a função cai silenciosamente nesse fallback — que ainda está com Markdown.

---

### O que será feito (2 operações no código)

**Operação A — Atualizar o system prompt nos dois pontos de chamada `callAI`**

Substituir a string atual pelos dois `callAI` (linhas 512–516 e 649–653) para:

```typescript
'Você é um assistente especializado em extração de dados de documentos médicos e jurídicos. Extraia apenas as informações solicitadas, sem inventar dados. REGRA DE FORMATAÇÃO ESTRITA: Retorne APENAS texto plano. É terminantemente proibido o uso de formatação Markdown (sem negritos, sem asteriscos, sem marcações de código). Use apenas quebras de linha para separar as informações.'
```

Isso cria a "Camada 2" sistêmica equivalente ao wrapper do IMPORT.

**Operação B — Corrigir os dois fallbacks hardcoded vulneráveis**

Substituir os blocos Markdown dos prompts `laudosMedicos` (linhas 142–148) e `examesComplementares` (linhas 160–166) no objeto `fieldPrompts` pelo mesmo formato plano já aplicado no banco:

```
ESTRUTURE ASSIM (sem negrito, sem traços, sem asteriscos):
LAUDO 1
Data: [DD/MM/AAAA]
Médico: [Nome] - [Especialidade]
Diagnósticos: [listar com CIDs]
...
NÃO use marcadores markdown (asteriscos, negrito, traços, bullets).
```

---

### Resumo do Estado Pós-Implementação

```text
+---------------------------+------------------+------------------+
| Camada                    | Antes desta PR   | Após esta PR     |
+---------------------------+------------------+------------------+
| 1. Prompts no banco (DB)  | CORRIGIDA        | CORRIGIDA        |
| 2. System prompt callAI   | VULNERAVEL       | CORRIGIDA        |
| 3. Fallback hardcoded     | VULNERAVEL       | CORRIGIDA        |
+---------------------------+------------------+------------------+
```

Após esta implementação, o pipeline REGEN terá proteção equivalente ao IMPORT: mesmo que um prompt individual falhe ou contenha Markdown, o system prompt da edge function bloqueará a formatação antes de chegar ao editor. E mesmo que o banco falhe, o fallback hardcoded também estará limpo.

**Escopo:** Apenas `supabase/functions/regerar-campo-pdf/index.ts`. Nenhuma migração de banco necessária.

# Correção segura dos quesitos (Reclamante/Reclamada) — escopo cirúrgico

## Garantias de segurança

- **Zero alteração no DevPrompts, registry de módulos, módulo previdenciário, exportadores DOCX/PDF, RLS, buckets, tabelas, edge functions de import/OCR (`processar-autos`, `prev-pre-processar`, `mistral-ocr`), `prompt-manager`, ou qualquer hook/UI do laudo.**
- **Nenhuma migration de banco. Nenhum prompt do `system_config` é sobrescrito** (o `seed-prompts` só grava prompts que ainda não existem; prompts atuais do usuário ficam intactos).
- **Nenhum laudo já salvo é tocado** (respeita a regra de não atualizar dados retroativamente).
- Mudanças isoladas em **2 arquivos backend**, ambos no caminho do botão "Gerar Respostas dos Quesitos" do módulo trabalhista. Qualquer outro fluxo (import, regen via PDF, exportação) continua exatamente igual.
- Mudança puramente **aditiva**: reforço de instrução no prompt + normalizador de string pós-IA. Não remove nem renomeia nada.

## O que está errado (resumo)

A IA está devolvendo o texto dos quesitos com a numeração original do processo (`1-`, `2-`) e **sem os rótulos `QUESITO N:` / `RESPOSTA:`**. No banco a pergunta e a resposta estão separadas só por uma linha em branco — em viewport estreito (mobile 384px) elas parecem coladas. Confirmado lendo o laudo `81c2bea4-…` atualizado em 20/06 21:04. Isso **não tem relação com as alterações do DevPrompts** (que são 100% client-side e não tocam prompts, IA ou edge functions).

## Mudanças

### 1. `supabase/functions/gerar-quesitos/index.ts` — único arquivo essencial

**a) Trocar a regra 5 do `SYSTEM_PROMPT`** (hoje usa `\\n` literal, frágil) por:

```
5. Cada par PERGUNTA/RESPOSTA deve ocupar DUAS linhas distintas:
   - linha 1: "QUESITO N: <pergunta>"
   - linha 2: "RESPOSTA: <resposta técnica>"
   Deixe UMA linha em branco antes do próximo QUESITO. Nunca cole a resposta na mesma linha da pergunta. Use os rótulos "QUESITO N:" e "RESPOSTA:" em caixa alta, sempre.
```

**b) Anexar bloco de formato no final de cada string de `DEFAULT_PROMPTS.juizo/reclamante/reclamada`** (o mesmo bloco para os três):

```
FORMATO OBRIGATÓRIO DA SAÍDA:

QUESITO 1: <pergunta integral>
RESPOSTA: <resposta técnica fundamentada nos dados clínicos>

QUESITO 2: <pergunta integral>
RESPOSTA: <resposta técnica fundamentada nos dados clínicos>

Renumere sequencialmente (1, 2, 3...) ignorando a numeração original do processo. Sempre escreva os rótulos "QUESITO N:" e "RESPOSTA:" em caixa alta. Uma linha em branco entre cada par.
```

> Esses defaults só entram em uso quando o prompt não existe no `system_config` (via `getPrompt(..., DEFAULT_PROMPTS[key], ...)` com `autoRegister: true`). Os prompts atuais do usuário, se já existirem no banco com outra versão, **não são alterados**.

**c) Normalizador defensivo pós-IA**, aplicado apenas ao texto retornado pela função, antes de devolver ao cliente:

```ts
function normalizarQuesitos(txt: string): string {
  return txt
    .replace(/([^\n])\s*(QUESITO\s*\d+\s*:)/gi, "$1\n\n$2")
    .replace(/([^\n])\s*(RESPOSTA\s*:)/gi, "$1\nRESPOSTA:")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
```

Aplicado **só** em `response[fieldMap[key]] = normalizarQuesitos(text.trim())`. Não toca em nada além da string de saída desta função.

### 2. `supabase/functions/seed-prompts/index.ts` — opcional, só uniformidade

Acrescentar a mesma regra "duas linhas separadas, linha em branco entre pares, rótulos em caixa alta" dentro do bloco `FORMATO DE SAÍDA` dos 3 `prompt_regen_quesitos*`. **Só afeta instalações novas** (o seed nunca sobrescreve prompts já existentes), portanto sem risco para o ambiente atual do cliente.

Se quiser ser ainda mais conservador, podemos **pular essa etapa 2** e fazer só a 1 — o problema relatado é resolvido apenas com a edição em `gerar-quesitos`.

## O que NÃO muda

- DevPrompts, registry, coverage, `prev-prompts-structure`, módulo previdenciário.
- Edge functions: `processar-autos`, `regerar-campo-pdf`, `prev-pre-processar`, `mistral-ocr`, `prompt-manager`, `ai-config`.
- Exportadores `generateLaudoDOCX.ts` / `generateLaudoPDF.ts` (já lidam corretamente com `QUESITO N:` / `RESPOSTA:`).
- Schema, RLS, buckets, secrets.
- Conteúdo já salvo nos laudos (o cliente pode regenerar manualmente se quiser).

## Arquivos tocados
- Editar: `supabase/functions/gerar-quesitos/index.ts`
- (opcional) Editar: `supabase/functions/seed-prompts/index.ts`

## Verificação após aplicar
1. Em um laudo trabalhista com PDF, clicar "Gerar Respostas dos Quesitos".
2. Conferir nos 3 campos: linhas no padrão `QUESITO 1: ...` / `RESPOSTA: ...` separadas por linha em branco.
3. Exportar DOCX e PDF e conferir que cada pergunta e cada resposta vira parágrafo próprio.
4. Sem regressão visível em DevPrompts, módulo previdenciário, import de autos ou impugnação.



# Plano — Blindagem Anti-Alucinacao no Resumo da Peticao + Auditoria de Permanencia

## 1. Atualizar o Prompt do Resumo da Peticao (3 locais no codigo + 1 no banco)

O prompt `prompt_gen_resumo_peticao` precisa ser atualizado com a regra anti-vies em **todos os locais** para garantir cobertura total:

### Arquivo 1: `supabase/functions/gerar-resumos/index.ts` (linhas 35-48)
Fallback usado quando o usuario clica "Resumir Texto" na UI.

### Arquivo 2: `supabase/functions/processar-autos/index.ts` (linhas 664-675)
Fallback usado durante a importacao automatica do PDF.

### Arquivo 3: `supabase/functions/seed-prompts/index.ts` (linhas 580-591)
Template usado para sincronizar/restaurar prompts no DevPanel.

**Novo prompt para os 3 arquivos:**

```
Voce e um perito medico especialista em medicina do trabalho.
Elabore um resumo tecnico e objetivo da peticao inicial para um laudo pericial.

Texto da Peticao Inicial extraido:
${peticaoInicial}

REGRAS DE REDACAO INQUEBRAVEIS (RISCO LEGAL):
1. ATENCAO AO VIES: E ESTRITAMENTE PROIBIDO presumir, inventar ou adicionar doencas ocupacionais tipicas da profissao (ex: tendinopatias, LER/DORT, sindrome do impacto, PAIR) se elas NAO estiverem textualmente descritas na peticao. O caso pode se tratar de um trauma grave ou acidente atipico.
2. Seja absolutamente fiel aos fatos: cite apenas as lesoes, sintomas e dinamicas de acidente que estao explicitas no texto fornecido.
3. Nao utilize placeholders ([INSERIR]). Se nao houver clareza, limite-se aos fatos apresentados.
4. Use apenas texto plano, sem Markdown, em no maximo 3 paragrafos continuos.

INSTRUCOES:
- Resuma os pontos principais alegados pelo reclamante
- Destaque a dinamica do adoecimento/acidente e as doencas reais mencionadas
- Identifique os nexos causais alegados
- Mencione os pedidos principais
```

### Banco de dados (system_config)
Ao executar "Sincronizar" ou "Restaurar Padrao" no DevPanel, o prompt atualizado do `seed-prompts` sera propagado automaticamente para o banco.

---

## 2. Auditoria de Permanencia das Correcoes

Sobre sua pergunta — **todas as correcoes sao permanentes e estao salvas no codigo-fonte (git)**. Nenhuma se perde ao redeployar ou atualizar o app.

| Correcao | Onde foi feita | Tipo | Permanente? |
|----------|---------------|------|-------------|
| Mapeamento de variaveis cruas (prontuario, etc.) | `processar-autos/index.ts` | Codigo | Sim (git) |
| Remocao do campo "Ha Incapacidade" | `generateLaudoDOCX.ts` | Codigo | Sim (git) |
| Nexo Causal mapeado para `nexo_causal_justificativa` | `ImportarAutosDialog.tsx` | Codigo | Sim (git) |
| Remocao da duplicacao Secao 14/16 | `ImportarAutosDialog.tsx` | Codigo | Sim (git) |
| Regra de idioma no system prompt (processar-autos) | `processar-autos/index.ts` | Codigo | Sim (git) |
| Regra de idioma inline no user prompt (processar-autos) | `processar-autos/index.ts` | Codigo | Sim (git) |
| Regra de idioma no gerar-resumos | `gerar-resumos/index.ts` | Codigo | Sim (git) |
| Anti-alucinacao no resumo peticao (este plano) | 3 arquivos .ts | Codigo | Sim (git) |

**Nenhuma correcao depende exclusivamente do banco de dados.** O banco (system_config/DevPanel) funciona como uma **camada de customizacao opcional** — se ele falhar ou for resetado, os fallbacks hardcoded no codigo assumem automaticamente. Essa e a arquitetura de 3 camadas de protecao do sistema.

---

## Operacoes Tecnicas (3 arquivos)

| # | Arquivo | Mudanca |
|---|---------|---------|
| 1 | `supabase/functions/gerar-resumos/index.ts` | Atualizar fallback `resumo_peticao` com regra anti-vies |
| 2 | `supabase/functions/processar-autos/index.ts` | Atualizar fallback `resumo_peticao` com regra anti-vies |
| 3 | `supabase/functions/seed-prompts/index.ts` | Atualizar template `prompt_gen_resumo_peticao` com regra anti-vies |

Apos o deploy, qualquer nova importacao de PDF ou geracao manual de resumo usara o prompt blindado contra alucinacoes de doencas presumidas.

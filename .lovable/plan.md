

# Plano — Corrigir Mapeamento de Prompt (Causa Raiz da Alucinacao)

## Diagnostico

O problema NAO e de cache nem de sincronizacao. E um **bug de mapeamento** no codigo.

Na funcao `getPromptForType()` do `processar-autos/index.ts`, o dicionario `PROMPT_ID_MAPPING` (linha 654) aponta para o ID **errado** no banco de dados:

```text
CODIGO ATUAL (linha 654):
  resumo_peticao  -->  'prompt_regen_resumoPeticaoInicial'  (prompt ANTIGO, sem regra anti-vies)
  resumo_contestacao --> 'prompt_regen_resumoContestacao'    (prompt ANTIGO)

CORRETO:
  resumo_peticao  -->  'prompt_gen_resumo_peticao'          (prompt NOVO, com regra anti-vies)
  resumo_contestacao --> 'prompt_gen_resumo_contestacao'     (prompt NOVO)
```

Quando a edge function importa o PDF, ela chama `getPromptForType('resumo_peticao', ctx)`, que busca `prompt_regen_resumoPeticaoInicial` no banco. Esse prompt antigo NAO contem a regra "ATENCAO AO VIES" e por isso a IA continua alucinando tendinopatias.

O "Restaurar Padrao de Fabrica" funcionou corretamente — ele atualizou o `prompt_gen_resumo_peticao`. Porem, o codigo nunca consulta esse ID durante a importacao.

## Solucao

Corrigir as duas entradas do `PROMPT_ID_MAPPING` para apontar para os IDs corretos:

### Arquivo: `supabase/functions/processar-autos/index.ts`

Linha 654-655, alterar de:

```
resumo_peticao: 'prompt_regen_resumoPeticaoInicial',
resumo_contestacao: 'prompt_regen_resumoContestacao',
```

Para:

```
resumo_peticao: 'prompt_gen_resumo_peticao',
resumo_contestacao: 'prompt_gen_resumo_contestacao',
```

Isso faz sentido semanticamente: durante a **importacao**, o sistema esta **gerando** o resumo pela primeira vez (categoria `gen`), nao **regenerando** a partir de um PDF existente (categoria `regen`).

## Verificacao de banco

Confirmado por query direta:

| ID no banco | Contem regra anti-vies? |
|---|---|
| `prompt_regen_resumoPeticaoInicial` | NAO (prompt generico antigo) |
| `prompt_gen_resumo_peticao` | SIM (regra "ATENCAO AO VIES" presente) |

## Impacto

- Zero risco: os IDs `prompt_gen_*` ja existem no banco e estao atualizados
- O fallback hardcoded (DEFAULT_PROMPTS) tambem ja contem a regra anti-vies como seguranca extra
- Nenhum outro arquivo precisa ser alterado
- Deploy apenas de `processar-autos`

## Resultado esperado

Apos o deploy, novas importacoes de PDF consultarao o prompt correto (`prompt_gen_resumo_peticao`) que contem a blindagem anti-alucinacao. O resumo da peticao refletira fielmente os fatos do PDF sem inventar doencas ocupacionais tipicas.


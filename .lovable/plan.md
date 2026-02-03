
# Plano de Correção: Permissão DELETE na tabela system_config

## Problema Identificado

A tabela `system_config` tem RLS habilitado mas **não possui política de DELETE** para desenvolvedores:

| Comando | Política | Status |
|---------|----------|--------|
| SELECT | Developers can view | ✅ |
| INSERT | Developers can insert | ✅ |
| UPDATE | Developers can update | ✅ |
| DELETE | (nenhuma) | ❌ **FALTANDO** |

Isso explica por que:
1. O log mostra "Deleted obsolete prompt" (porque `error` é `null`)
2. Mas o banco de dados **não deleta nada** (0 linhas afetadas)
3. O prompt fantasma continua aparecendo

## Solução

Adicionar política RLS de DELETE para desenvolvedores na tabela `system_config`.

## Comando SQL

```sql
CREATE POLICY "Developers can delete system_config"
ON public.system_config
FOR DELETE
TO authenticated
USING (is_developer());
```

## Arquivo a Modificar

Nenhum arquivo de código precisa ser alterado. A lógica de deleção já está correta - só falta a permissão no banco.

## Arquivos Relacionados (apenas para referência)

| Arquivo | Status |
|---------|--------|
| `supabase/functions/seed-prompts/index.ts` | Código OK - já deleta corretamente |
| `src/components/dev-panel/DevPrompts.tsx` | Código OK - já chama a função corretamente |

## Resultado Esperado

Após adicionar a política:
1. Clicar em "Restaurar Padrão de Fábrica" → prompt órfão será deletado de verdade
2. O `prompt_regen_descricaoPostoTrabalho` sumirá do banco
3. A exportação PDF não mostrará mais o campo fantasma
4. A seção "Dados do Posto de Trabalho" mostrará apenas "Ambiente e Atividades Laborais"



# Fix: Politicas RLS da tabela user_presence sao TODAS RESTRICTIVE

## Causa raiz definitiva

Todas as politicas RLS na tabela `user_presence` estao definidas como **RESTRICTIVE** (nao permissivas). No PostgreSQL, o modelo de avaliacao e:

1. Primeiro, todas as politicas PERMISSIVE sao avaliadas com logica OR (basta uma passar)
2. Depois, todas as RESTRICTIVE sao avaliadas com logica AND (todas precisam passar)
3. Se nao ha NENHUMA politica PERMISSIVE, o acesso e **negado por padrao**

Resultado: nenhum usuario consegue fazer INSERT nem UPDATE, porque nao existe nenhuma politica PERMISSIVE para conceder o acesso base.

O Diogo so tem um registro antigo porque ele foi criado antes de RLS ser ativada (ou por outra via).

## Correcao

Uma unica migracao SQL para recriar as 3 politicas como PERMISSIVE:

```sql
-- Recriar INSERT como PERMISSIVE
DROP POLICY IF EXISTS "Users can upsert own presence" ON public.user_presence;
CREATE POLICY "Users can upsert own presence"
  ON public.user_presence
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Recriar UPDATE como PERMISSIVE
DROP POLICY IF EXISTS "Users can update own presence" ON public.user_presence;
CREATE POLICY "Users can update own presence"
  ON public.user_presence
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Recriar SELECT (dev) como PERMISSIVE
DROP POLICY IF EXISTS "Developers can view presence" ON public.user_presence;
CREATE POLICY "Developers can view presence"
  ON public.user_presence
  FOR SELECT
  TO authenticated
  USING (is_developer());
```

A diferenca tecnica: sem o `AS RESTRICTIVE`, PostgreSQL cria politicas como PERMISSIVE por padrao, que e o comportamento correto para este caso.

## Seguranca

- Semantica identica: usuarios so alteram sua propria presenca, devs podem visualizar tudo
- Nenhum arquivo de codigo alterado
- Nenhum edge function tocado
- Apenas as 3 politicas RLS da tabela `user_presence` sao recriadas


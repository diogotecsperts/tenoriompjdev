
# Fix: RLS da tabela user_presence bloqueando upsert

## Problema encontrado

Nos logs do banco de dados, encontrei erros repetidos a cada 60 segundos:
```text
ERROR: new row violates row-level security policy for table "user_presence"
```

A causa raiz: a politica de UPDATE da tabela `user_presence` tem apenas `USING (auth.uid() = user_id)` mas **nao tem `WITH CHECK`**. No PostgreSQL, quando um UPSERT (INSERT ON CONFLICT UPDATE) executa a parte de UPDATE, ele precisa de um `WITH CHECK` explicito para validar a nova linha sendo escrita. Sem isso, o banco rejeita a operacao.

O Diogo funciona porque ja tinha um registro criado anteriormente. O Bruno nunca conseguiu criar o registro inicial, e os upserts continuam falhando silenciosamente.

## Correcao

### Migracao SQL

Recriar a politica de UPDATE com `WITH CHECK`:

```sql
DROP POLICY IF EXISTS "Users can update own presence" ON public.user_presence;

CREATE POLICY "Users can update own presence"
  ON public.user_presence
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

Isso permite que o upsert funcione corretamente tanto para INSERT quanto para UPDATE no ON CONFLICT.

## Seguranca

- Nenhum edge function tocado
- Nenhum arquivo de codigo alterado
- Apenas uma politica RLS corrigida na tabela `user_presence`
- A semantica de seguranca permanece identica (usuario so pode alterar sua propria presenca)

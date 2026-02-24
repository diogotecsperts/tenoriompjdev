

# Fix: Falta politica SELECT para usuarios normais na tabela user_presence

## Causa raiz

O PostgreSQL exige que o usuario tenha permissao SELECT na coluna usada no `ON CONFLICT` para que o upsert funcione. Na tabela `user_presence`, apenas desenvolvedores possuem politica SELECT (via `is_developer()`). Usuarios normais como o Bruno nao conseguem fazer upsert porque nao tem visibilidade sobre a coluna de conflito (`user_id`).

Isso explica perfeitamente o comportamento observado:
- **Diogo** (developer) tem SELECT via `is_developer()` -> upsert funciona
- **Bruno** (usuario normal) nao tem SELECT -> ON CONFLICT falha -> erro RLS

## Correcao

Uma migracao SQL para adicionar uma politica SELECT que permite usuarios verem sua propria linha de presenca:

```sql
CREATE POLICY "Users can view own presence"
  ON public.user_presence
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
```

## Impacto

- Nenhum arquivo de codigo alterado
- Nenhum edge function tocado
- Apenas uma nova politica SELECT adicionada
- Seguranca mantida: cada usuario so ve sua propria presenca, desenvolvedores continuam vendo tudo
- Corrige definitivamente o upsert para usuarios nao-desenvolvedores


-- Remove o DEFAULT hardcoded desatualizado da coluna metodologia_pericial
-- O texto padrão agora é buscado explicitamente do system_config pelo código

ALTER TABLE laudos 
ALTER COLUMN metodologia_pericial 
SET DEFAULT '';
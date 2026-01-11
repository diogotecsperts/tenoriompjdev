-- Fase 1A: Adicionar 'developer' ao enum app_role (transação separada)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'developer';
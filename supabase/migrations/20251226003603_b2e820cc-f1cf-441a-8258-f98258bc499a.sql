-- Create enum for expense type
CREATE TYPE public.tipo_despesa AS ENUM ('combustivel', 'hospedagem', 'alimentacao', 'material', 'transporte', 'outros');

-- Create enum for payment status
CREATE TYPE public.status_pagamento AS ENUM ('pendente', 'recebido', 'atrasado', 'cancelado');

-- Create enum for payment method
CREATE TYPE public.forma_pagamento AS ENUM ('pix', 'transferencia', 'dinheiro', 'cheque', 'cartao', 'boleto');

-- Create financeiro table
CREATE TABLE public.financeiro (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  laudo_id UUID REFERENCES public.laudos(id) ON DELETE SET NULL,
  descricao TEXT NOT NULL,
  valor_honorarios DECIMAL(10,2) DEFAULT 0,
  valor_despesas DECIMAL(10,2) DEFAULT 0,
  tipo_despesa public.tipo_despesa,
  data_vencimento DATE,
  data_pagamento DATE,
  status public.status_pagamento NOT NULL DEFAULT 'pendente',
  forma_pagamento public.forma_pagamento,
  observacoes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add valor_honorarios column to laudos table
ALTER TABLE public.laudos ADD COLUMN valor_honorarios DECIMAL(10,2) DEFAULT 0;

-- Enable RLS
ALTER TABLE public.financeiro ENABLE ROW LEVEL SECURITY;

-- RLS policies for financeiro table
CREATE POLICY "Users can view own financeiro"
ON public.financeiro
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own financeiro"
ON public.financeiro
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own financeiro"
ON public.financeiro
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own financeiro"
ON public.financeiro
FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all financeiro"
ON public.financeiro
FOR SELECT
USING (is_admin());

CREATE POLICY "Admins can update all financeiro"
ON public.financeiro
FOR UPDATE
USING (is_admin());

CREATE POLICY "Admins can delete all financeiro"
ON public.financeiro
FOR DELETE
USING (is_admin());

-- Trigger for updated_at
CREATE TRIGGER update_financeiro_updated_at
BEFORE UPDATE ON public.financeiro
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Index for performance
CREATE INDEX idx_financeiro_user_id ON public.financeiro(user_id);
CREATE INDEX idx_financeiro_laudo_id ON public.financeiro(laudo_id);
CREATE INDEX idx_financeiro_status ON public.financeiro(status);
CREATE INDEX idx_financeiro_data_vencimento ON public.financeiro(data_vencimento);
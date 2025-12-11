-- Add status field to laudos table
ALTER TABLE public.laudos 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'rascunho';

-- Create modelos_laudo table
CREATE TABLE IF NOT EXISTS public.modelos_laudo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'geral',
  icon TEXT DEFAULT 'activity',
  is_favorite BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  template_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for modelos_laudo
ALTER TABLE public.modelos_laudo ENABLE ROW LEVEL SECURITY;

-- RLS policies for modelos_laudo
CREATE POLICY "Users can view own modelos" 
ON public.modelos_laudo 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own modelos" 
ON public.modelos_laudo 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own modelos" 
ON public.modelos_laudo 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own modelos" 
ON public.modelos_laudo 
FOR DELETE 
USING (auth.uid() = user_id);

-- Admins policies for modelos_laudo
CREATE POLICY "Admins can view all modelos" 
ON public.modelos_laudo 
FOR SELECT 
USING (is_admin());

CREATE POLICY "Admins can update all modelos" 
ON public.modelos_laudo 
FOR UPDATE 
USING (is_admin());

CREATE POLICY "Admins can delete all modelos" 
ON public.modelos_laudo 
FOR DELETE 
USING (is_admin());

-- Create impugnacoes table
CREATE TABLE IF NOT EXISTS public.impugnacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  laudo_id UUID REFERENCES public.laudos(id) ON DELETE SET NULL,
  processo_numero TEXT,
  quesitos JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pendente',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for impugnacoes
ALTER TABLE public.impugnacoes ENABLE ROW LEVEL SECURITY;

-- RLS policies for impugnacoes
CREATE POLICY "Users can view own impugnacoes" 
ON public.impugnacoes 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own impugnacoes" 
ON public.impugnacoes 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own impugnacoes" 
ON public.impugnacoes 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own impugnacoes" 
ON public.impugnacoes 
FOR DELETE 
USING (auth.uid() = user_id);

-- Admins policies for impugnacoes
CREATE POLICY "Admins can view all impugnacoes" 
ON public.impugnacoes 
FOR SELECT 
USING (is_admin());

CREATE POLICY "Admins can update all impugnacoes" 
ON public.impugnacoes 
FOR UPDATE 
USING (is_admin());

CREATE POLICY "Admins can delete all impugnacoes" 
ON public.impugnacoes 
FOR DELETE 
USING (is_admin());

-- Create anotacoes column in laudos for the notes sheet
ALTER TABLE public.laudos 
ADD COLUMN IF NOT EXISTS anotacoes TEXT DEFAULT '';

-- Add triggers for updated_at
CREATE TRIGGER update_modelos_laudo_updated_at
  BEFORE UPDATE ON public.modelos_laudo
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_impugnacoes_updated_at
  BEFORE UPDATE ON public.impugnacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
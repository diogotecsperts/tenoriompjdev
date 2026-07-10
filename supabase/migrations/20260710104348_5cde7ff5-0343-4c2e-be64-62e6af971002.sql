
ALTER TABLE public.prev_pautas REPLICA IDENTITY FULL;
ALTER TABLE public.prev_pericias REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='prev_pautas') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.prev_pautas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='prev_pericias') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.prev_pericias';
  END IF;
END $$;

DROP POLICY IF EXISTS "Developers can view all prev_pautas" ON public.prev_pautas;
CREATE POLICY "Developers can view all prev_pautas"
ON public.prev_pautas FOR SELECT
TO authenticated
USING (public.is_developer());

DROP POLICY IF EXISTS "Developers can view all prev_pericias" ON public.prev_pericias;
CREATE POLICY "Developers can view all prev_pericias"
ON public.prev_pericias FOR SELECT
TO authenticated
USING (public.is_developer());

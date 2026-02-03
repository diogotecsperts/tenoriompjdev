-- Add DELETE policy for developers on system_config table
CREATE POLICY "Developers can delete system_config"
ON public.system_config
FOR DELETE
TO authenticated
USING (is_developer());
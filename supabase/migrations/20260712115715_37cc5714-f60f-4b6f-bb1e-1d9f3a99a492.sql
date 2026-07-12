-- Allow an authenticated user to read their own signup_requests row(s)
-- so the client-side gate in AuthContext can verify finalized_at.
CREATE POLICY "Users can view their own signup request"
ON public.signup_requests
FOR SELECT
TO authenticated
USING (invite_user_id = auth.uid());

GRANT SELECT ON public.signup_requests TO authenticated;
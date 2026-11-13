CREATE POLICY n8n_chat_histories_deny_client_access
ON public.n8n_chat_histories
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);
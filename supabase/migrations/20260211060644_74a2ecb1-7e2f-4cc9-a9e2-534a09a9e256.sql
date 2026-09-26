-- Reset TI password to plain text so the app's comparison works
UPDATE public.ti_security_config 
SET password_hash = 'admin123', updated_at = now()
WHERE id = 'b8e38a84-0bca-4cfd-9ce7-a61dd7bf93b7';
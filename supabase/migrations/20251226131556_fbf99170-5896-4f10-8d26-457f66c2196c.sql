-- Adicionar colunas para armazenar QR Code PIX no pending_bookings
-- Isso permite que o cliente retorne e veja o mesmo QR Code gerado anteriormente

ALTER TABLE public.pending_bookings 
ADD COLUMN IF NOT EXISTS pix_qr_code TEXT,
ADD COLUMN IF NOT EXISTS pix_payload TEXT,
ADD COLUMN IF NOT EXISTS asaas_payment_id TEXT;
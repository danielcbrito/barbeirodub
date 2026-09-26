
-- Add soft-delete column to barbeiros
ALTER TABLE public.barbeiros 
ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- Add index for querying active (non-deleted) barbers
CREATE INDEX IF NOT EXISTS idx_barbeiros_deleted_at ON public.barbeiros (deleted_at) WHERE deleted_at IS NOT NULL;

-- Update the public view to exclude soft-deleted barbers from client-facing queries
-- Ensure booking queries exclude deleted barbers
COMMENT ON COLUMN public.barbeiros.deleted_at IS 'Soft-delete timestamp. Barber has 7-day grace period to access financial data after deletion.';

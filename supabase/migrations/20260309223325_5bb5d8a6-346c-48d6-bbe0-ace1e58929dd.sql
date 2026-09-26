
-- Add role column to barbeiro_unidades for unit-level admin designation
ALTER TABLE public.barbeiro_unidades 
ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'barbeiro' 
CHECK (role IN ('barbeiro', 'admin'));

-- Add comment for clarity
COMMENT ON COLUMN public.barbeiro_unidades.role IS 'Role within the unit: barbeiro (default) or admin (full control of this unit)';

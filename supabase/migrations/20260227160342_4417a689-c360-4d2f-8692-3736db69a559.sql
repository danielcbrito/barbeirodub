
-- Add blocked column to tenant_clientes for tenant-scoped blocking
ALTER TABLE public.tenant_clientes 
ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false;

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_tenant_clientes_blocked 
ON public.tenant_clientes(tenant_id, blocked) 
WHERE blocked = true;

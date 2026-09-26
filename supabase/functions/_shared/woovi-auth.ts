// Helper de autenticação para edge functions Woovi.
// Valida o JWT do caller e devolve { userId, supabaseAdmin }.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { errorResponse } from './woovi-client.ts';

export interface AuthedContext {
  userId: string;
  admin: SupabaseClient;
}

export async function requireUser(req: Request): Promise<AuthedContext | Response> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return errorResponse('UNAUTHORIZED', 'JWT ausente', 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return errorResponse('UNAUTHORIZED', 'JWT inválido', 401);
  return { userId: data.user.id, admin };
}

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

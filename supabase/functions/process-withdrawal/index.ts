import { requireUser } from '../_shared/woovi-auth.ts';
import { corsHeaders, errorResponse } from '../_shared/woovi-client.ts';
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const ctx = await requireUser(req);
  if (ctx instanceof Response) return ctx;
  return errorResponse('ENDPOINT_RETIRED', 'Use o saque Pix na carteira Woovi; esta operação antiga foi desativada.', 410);
});

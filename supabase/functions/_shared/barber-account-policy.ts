// Regras puras do recebimento próprio por barbeiro (testáveis).
export type AccountStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export function onlyDigits(v: string | null | undefined) { return (v ?? '').replace(/\D/g, ''); }

export function validateOnboarding(input: { full_name?: string; tax_id?: string; owner_cpf?: string | null; email?: string; phone?: string; pix_key?: string }) {
  const missing: string[] = [];
  const name = (input.full_name ?? '').trim();
  if (name.split(/\s+/).length < 2) missing.push('Nome completo');
  const doc = onlyDigits(input.tax_id);
  if (doc.length !== 14) missing.push('CNPJ');
  const ownerCpf = onlyDigits(input.owner_cpf);
  if (ownerCpf.length !== 11) missing.push('CPF do titular');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((input.email ?? '').trim())) missing.push('E-mail');
  const phone = onlyDigits(input.phone);
  if (phone.length < 10 || phone.length > 13) missing.push('Telefone');
  if (!(input.pix_key ?? '').trim()) missing.push('Chave Pix');
  return { ok: missing.length === 0, missing, taxType: 'BR:CNPJ' as const, doc, ownerCpf };
}

/** Pix do cliente só vai para a conta do barbeiro quando ela estiver aprovada e com credencial. */
export function chargeRoute(status: AccountStatus | null | undefined, hasCredential: boolean): 'own_account' | 'unavailable' {
  return status === 'approved' && hasCredential ? 'own_account' : 'unavailable';
}

/** AppID Woovi = base64(clientId:clientSecret). */
export function appIdFrom(clientId: string, clientSecret: string) {
  return btoa(`${clientId}:${clientSecret}`);
}

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { chargeRoute, validateOnboarding, appIdFrom } from './barber-account-policy.ts';

Deno.test('Sem subconta: Pix só existe na conta própria quando aprovada com credencial', () => {
  assertEquals(chargeRoute('approved', true), 'own_account');
  assertEquals(chargeRoute('pending', true), 'unavailable');
  assertEquals(chargeRoute('approved', false), 'unavailable');
  assertEquals(chargeRoute(null, false), 'unavailable');
});
Deno.test('Cadastro exige nome completo, CPF/CNPJ, e-mail, telefone e chave Pix', () => {
  const r = validateOnboarding({ full_name: 'Jose', tax_id: '123', email: 'x', phone: '1', pix_key: '' });
  assertEquals(r.missing, ['Nome completo', 'CNPJ', 'CPF do titular', 'E-mail', 'Telefone', 'Chave Pix']);
  const ok = validateOnboarding({ full_name: 'José Jailson', tax_id: '12.345.678/0001-90', owner_cpf: '123.456.789-01', email: 'a@b.com', phone: '(11) 91234-5678', pix_key: 'a@b.com' });
  assertEquals(ok.ok, true); assertEquals(ok.taxType, 'BR:CNPJ'); assertEquals(ok.ownerCpf, '12345678901');
});
Deno.test('AppID é base64 de clientId:clientSecret', () => {
  assertEquals(appIdFrom('a', 'b'), 'YTpi');
});

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { chargeRoute, mainAccountChargeAllowed, validateOnboarding, appIdFrom, MAIN_ACCOUNT_BARBER_ID } from './barber-account-policy.ts';

Deno.test('Sem conta aprovada, o Pix permanece indisponível mesmo com credencial antiga', () => {
  assertEquals(chargeRoute(null, 'woovi', true), 'unavailable');
  assertEquals(chargeRoute('draft', 'woovi', true), 'unavailable');
  assertEquals(chargeRoute('pending', 'mercadopago', true), 'unavailable');
  assertEquals(chargeRoute('rejected', 'mercadopago', true), 'unavailable');
});

Deno.test('Conta Woovi aprovada exige a credencial do próprio barbeiro', () => {
  assertEquals(chargeRoute('approved', 'woovi', true), 'woovi');
  assertEquals(chargeRoute('approved', 'woovi', false), 'unavailable');
});

Deno.test('Conta Mercado Pago aprovada exige a conexão do próprio barbeiro', () => {
  assertEquals(chargeRoute('approved', 'mercadopago', true), 'mercadopago');
  assertEquals(chargeRoute('approved', 'mercadopago', false), 'unavailable');
});

Deno.test('A antiga subconta operacional é exclusiva do Túlio', () => {
  assertEquals(mainAccountChargeAllowed(MAIN_ACCOUNT_BARBER_ID, '+5511952263002'), true);
  assertEquals(mainAccountChargeAllowed(MAIN_ACCOUNT_BARBER_ID, null), false);
  assertEquals(mainAccountChargeAllowed('ee238642-bc38-4de6-ba86-9eed40262fc7', '+5511959637439'), false);
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

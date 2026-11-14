export interface TenantCheckoutAddress {
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zipcode?: string | null;
  country?: string | null;
}

export interface TenantCheckoutCustomer {
  name?: string | null;
  taxID?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: TenantCheckoutAddress;
}

const digits = (value?: string | null) => (value ?? "").replace(/\D/g, "");
const text = (value?: string | null) => (value ?? "").trim();

function allDigitsEqual(value: string) {
  return /^(\d)\1+$/.test(value);
}

export function isValidCpf(value?: string | null): boolean {
  const cpf = digits(value);
  if (cpf.length !== 11 || allDigitsEqual(cpf)) return false;

  const calculateDigit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculateDigit(9) === Number(cpf[9]) && calculateDigit(10) === Number(cpf[10]);
}

export function isValidCnpj(value?: string | null): boolean {
  const cnpj = digits(value);
  if (cnpj.length !== 14 || allDigitsEqual(cnpj)) return false;

  const calculateDigit = (weights: number[]) => {
    const sum = weights.reduce((total, weight, index) => total + Number(cnpj[index]) * weight, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return calculateDigit([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(cnpj[12])
    && calculateDigit([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(cnpj[13]);
}

export function isValidCustomerDocument(value?: string | null): boolean {
  return isValidCpf(value) || isValidCnpj(value);
}

/** Woovi requires payer identity and, for Pix Automatic, the complete payer address. */
export function getMissingTenantCheckoutFields(customer: TenantCheckoutCustomer): string[] {
  const missing: string[] = [];
  const address = customer.address ?? {};
  const phone = digits(customer.phone);

  if (text(customer.name).length < 2) missing.push("Nome do responsável ou da barbearia");
  if (!isValidCustomerDocument(customer.taxID)) missing.push("CPF ou CNPJ válido");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(customer.email))) missing.push("E-mail válido");
  if (phone.length < 10 || phone.length > 13) missing.push("Telefone ou WhatsApp válido");
  if (!text(address.street)) missing.push("Rua / Logradouro");
  if (!text(address.number)) missing.push("Número do endereço");
  if (!text(address.neighborhood)) missing.push("Bairro");
  if (!text(address.city)) missing.push("Cidade");
  if (!/^[A-Za-z]{2}$/.test(text(address.state))) missing.push("Estado (UF)");
  if (digits(address.zipcode).length !== 8) missing.push("CEP válido");

  return missing;
}

/**
 * Mapeamento de logos de bancos brasileiros
 * Importações ES6 para bundling correto
 */
import nubankLogo from "@/assets/banks/nubank.png";
import interLogo from "@/assets/banks/inter.png";
import santanderLogo from "@/assets/banks/santander.png";
import pagbankLogo from "@/assets/banks/pagbank.png";
import mercadoPagoLogo from "@/assets/banks/mercado-pago.png";

/** Dados de cada banco */
export interface BancoInfo {
  code: string;
  name: string;
  logo?: string;
}

/** Lista completa de bancos */
export const bancosBR: BancoInfo[] = [
  { code: "260", name: "Nubank", logo: nubankLogo },
  { code: "077", name: "Inter", logo: interLogo },
  { code: "237", name: "Bradesco" },
  { code: "341", name: "Itaú" },
  { code: "001", name: "Banco do Brasil" },
  { code: "104", name: "Caixa Econômica" },
  { code: "033", name: "Santander", logo: santanderLogo },
  { code: "756", name: "Sicoob" },
  { code: "748", name: "Sicredi" },
  { code: "212", name: "Banco Original" },
  { code: "336", name: "C6 Bank" },
  { code: "290", name: "PagBank", logo: pagbankLogo },
  { code: "323", name: "Mercado Pago", logo: mercadoPagoLogo },
  { code: "380", name: "PicPay" },
  { code: "403", name: "Cora" },
  { code: "197", name: "Stone" },
  { code: "332", name: "Acesso Soluções" },
  { code: "999", name: "Outro" },
];

/** Retorna nome legível do banco pelo código */
export const getBancoName = (code: string): string =>
  bancosBR.find((b) => b.code === code)?.name || code;

/** Retorna logo do banco pelo código (ou undefined) */
export const getBancoLogo = (code: string): string | undefined =>
  bancosBR.find((b) => b.code === code)?.logo;

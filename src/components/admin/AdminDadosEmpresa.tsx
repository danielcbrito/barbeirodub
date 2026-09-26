import { Routes, Route, useSearchParams } from "react-router-dom";
import { DadosEmpresaHub } from "./dados-empresa/DadosEmpresaHub";
import { DadosEmpresaIdentificacaoPage } from "./dados-empresa/DadosEmpresaIdentificacaoPage";
import { DadosEmpresaContatoPage } from "./dados-empresa/DadosEmpresaContatoPage";
import { DadosEmpresaEnderecoPage } from "./dados-empresa/DadosEmpresaEnderecoPage";
import { DadosEmpresaOnlinePage } from "./dados-empresa/DadosEmpresaOnlinePage";
import { DadosEmpresaUnitSelector } from "./dados-empresa/DadosEmpresaUnitSelector";

interface AdminDadosEmpresaProps {
  basePath?: string;
  tenantId?: string | null;
}

/**
 * Router para Dados da Barbearia.
 * Hub principal com cards de navegação + sub-páginas individuais por categoria.
 */
export function AdminDadosEmpresa({ basePath = "/admin", tenantId }: AdminDadosEmpresaProps) {
  const [searchParams] = useSearchParams();
  const selectedUnidadeId = searchParams.get("unidade");

  return (
    <Routes>
      <Route index element={<DadosEmpresaHub basePath={basePath} tenantId={tenantId} selectedUnidadeId={selectedUnidadeId} />} />
      <Route path="identificacao" element={<DadosEmpresaIdentificacaoPage basePath={basePath} tenantId={tenantId} unidadeId={selectedUnidadeId} />} />
      <Route path="contato" element={<DadosEmpresaContatoPage basePath={basePath} tenantId={tenantId} unidadeId={selectedUnidadeId} />} />
      <Route path="endereco" element={<DadosEmpresaEnderecoPage basePath={basePath} tenantId={tenantId} unidadeId={selectedUnidadeId} />} />
      <Route path="online" element={<DadosEmpresaOnlinePage basePath={basePath} tenantId={tenantId} unidadeId={selectedUnidadeId} />} />
      <Route path="trocar-unidade" element={<DadosEmpresaUnitSelector basePath={basePath} tenantId={tenantId} selectedUnidadeId={selectedUnidadeId} />} />
    </Routes>
  );
}

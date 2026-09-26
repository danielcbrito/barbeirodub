import { Routes, Route, Navigate } from "react-router-dom";
import { AdminPlanos } from "./AdminPlanos";
import { AdminCortes } from "./AdminCortes";

interface AdminServicosProps {
  tenantId?: string;
  basePath?: string;
}

export function AdminServicos({ tenantId, basePath = "/admin" }: AdminServicosProps) {
  return (
    <Routes>
      <Route index element={<Navigate to="planos" replace />} />
      <Route path="planos" element={<AdminPlanos tenantId={tenantId} basePath={basePath} />} />
      <Route path="cortes" element={<AdminCortes tenantId={tenantId} basePath={basePath} />} />
    </Routes>
  );
}

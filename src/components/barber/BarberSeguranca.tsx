import { Routes, Route } from "react-router-dom";
import { BarberSegurancaHub } from "./seguranca/BarberSegurancaHub";
import { SegurancaSenhaPainel } from "@/components/admin/seguranca/SegurancaSenhaPainel";
import { SegurancaPinCarteira } from "@/components/admin/seguranca/SegurancaPinCarteira";

/**
 * Segurança do Barbeiro — Hub + sub-rotas.
 * Reutiliza as subpáginas do admin (SegurancaSenhaPainel, SegurancaPinCarteira)
 * com basePath do barbeiro para navegação correta.
 */
export function BarberSeguranca({ basePath = "/barbeiro" }: { basePath?: string }) {
  return (
    <Routes>
      <Route index element={<BarberSegurancaHub basePath={basePath} />} />
      <Route path="senha-painel" element={<SegurancaSenhaPainel basePath={basePath} />} />
      <Route path="pin-carteira" element={<SegurancaPinCarteira basePath={basePath} />} />
    </Routes>
  );
}

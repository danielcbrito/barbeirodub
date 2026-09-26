import { useState, useCallback } from "react";
import { toast } from "sonner";

interface ViaCepResult {
  cep: string;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

/**
 * Hook para busca automática de endereço via ViaCEP.
 * Retorna função de busca e estado de loading.
 */
export function useCepLookup() {
  const [loadingCep, setLoadingCep] = useState(false);

  const fetchCep = useCallback(async (cep: string): Promise<ViaCepResult | null> => {
    const cleaned = cep.replace(/\D/g, "");
    if (cleaned.length !== 8) return null;

    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`);
      if (!res.ok) throw new Error("Erro na requisição");
      const data: ViaCepResult = await res.json();
      if (data.erro) {
        toast.error("CEP não encontrado");
        return null;
      }
      return data;
    } catch {
      toast.error("Erro ao buscar CEP");
      return null;
    } finally {
      setLoadingCep(false);
    }
  }, []);

  return { fetchCep, loadingCep };
}

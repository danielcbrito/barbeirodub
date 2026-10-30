// Never include provider bodies in errors: they may contain credentials or pairing codes.
export class EvolutionRequestError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function normalizePairingPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const number = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return /^[1-9]\d{11,14}$/.test(number) ? number : null;
}

export async function readEvolutionState(url: string, token: string, name: string, request: typeof fetch = fetch): Promise<string | null> {
  const response = await request(`${url}/instance/connectionState/${encodeURIComponent(name)}`, {
    headers: { apikey: token }, signal: AbortSignal.timeout(10000),
  });
  const data = await response.json().catch(() => null);
  if (response.status === 404) return null;
  if (!response.ok) throw new EvolutionRequestError(response.status, "EVOLUTION_STATUS_FAILED", "Não foi possível consultar a conexão do WhatsApp.");
  const state = data?.instance?.state ?? data?.state;
  if (typeof state !== "string") throw new EvolutionRequestError(502, "EVOLUTION_STATUS_FAILED", "O serviço retornou um estado de conexão inválido.");
  return state;
}

export async function resetPairingSession(url: string, token: string, name: string, request: typeof fetch = fetch): Promise<void> {
  const response = await request(`${url}/instance/logout/${encodeURIComponent(name)}`, {
    method: "DELETE", headers: { apikey: token }, signal: AbortSignal.timeout(10000),
  });
  await response.text();
  // A missing instance can be recreated; all other failures must stop code generation.
  if (!response.ok && response.status !== 404) {
    throw new EvolutionRequestError(response.status, "PAIRING_RESET_FAILED", "Não foi possível encerrar a tentativa anterior. Tente novamente ou conecte pelo QR Code.");
  }
}

export async function requestEvolutionPairing(url: string, token: string, name: string, phone: string, request: typeof fetch = fetch): Promise<string | null> {
  const response = await request(`${url}/instance/connect/${encodeURIComponent(name)}?number=${encodeURIComponent(phone)}`, {
    headers: { apikey: token }, signal: AbortSignal.timeout(10000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new EvolutionRequestError(response.status, "PAIRING_CONNECT_FAILED", "O serviço recusou a geração do código. Confira o número ou conecte pelo QR Code.");
  const code = data?.pairingCode ?? data?.qrcode?.pairingCode;
  return typeof code === "string" && /^[A-Z0-9]{8}$/.test(code.replace(/-/g, "").toUpperCase()) ? code : null;
}
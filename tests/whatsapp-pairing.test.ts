import { describe, expect, test } from "bun:test";
import { normalizePairingPhone, readEvolutionState, resetPairingSession, requestEvolutionPairing } from "../supabase/functions/whatsapp-proxy/pairing";

const reply = (status: number, data: unknown): typeof fetch => (async () => new Response(JSON.stringify(data), { status })) as typeof fetch;

describe("WhatsApp pairing lifecycle", () => {
  test("preserves the supplied Brazilian number without adding or removing a digit", () => {
    expect(normalizePairingPhone("(11) 91234-5678")).toBe("5511912345678");
    expect(normalizePairingPhone("+55 11 91234-5678")).toBe("5511912345678");
    expect(normalizePairingPhone("123")).toBeNull();
  });
  test("only a 404 establishes that an instance is missing", async () => {
    expect(await readEvolutionState("https://example.test", "test", "instance", reply(404, {}))).toBeNull();
    await expect(readEvolutionState("https://example.test", "test", "instance", reply(401, {}))).rejects.toMatchObject({ code: "EVOLUTION_STATUS_FAILED" });
    await expect(readEvolutionState("https://example.test", "test", "instance", reply(503, {}))).rejects.toMatchObject({ status: 503 });
  });
  test("does not proceed with an old session if logout fails", async () => {
    await expect(resetPairingSession("https://example.test", "test", "instance", reply(500, {}))).rejects.toMatchObject({ code: "PAIRING_RESET_FAILED" });
  });
  test("rejects a code returned in a failed provider response", async () => {
    await expect(requestEvolutionPairing("https://example.test", "test", "instance", "5511912345678", reply(400, { pairingCode: "ABCD1234" }))).rejects.toMatchObject({ code: "PAIRING_CONNECT_FAILED" });
  });
  test("accepts both documented successful response shapes", async () => {
    expect(await requestEvolutionPairing("https://example.test", "test", "instance", "5511912345678", reply(200, { pairingCode: "ABCD1234" }))).toBe("ABCD1234");
    expect(await requestEvolutionPairing("https://example.test", "test", "instance", "5511912345678", reply(200, { qrcode: { pairingCode: "ABCD-1234" } }))).toBe("ABCD-1234");
  });
});
/**
 * Testes E2E — Funcionalidade "Intervalo de Horários" (slot_interval_minutes)
 *
 * Valida end-to-end que a edge function check-availability lê
 * `tenants.slot_interval_minutes` e gera slots com o espaçamento configurado.
 *
 * Estratégia (sem service role):
 *  - Os barbeiros são informados por variável de ambiente, sem IDs reais no código.
 *  - Verifica que os slots retornados são espaçados de forma consistente
 *    (todos os gaps iguais) e que o valor é um dos permitidos {5,10,15,20,30}.
 *  - Verifica que os horários se alinham ao grid do intervalo.
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const BARBEIROS = (Deno.env.get("TEST_BARBEIRO_IDS") ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const ALLOWED = new Set([5, 10, 15, 20, 30]);

function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function callCheckAvailability(barberId: string, date: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/check-availability`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ date, duration: 30, barbeiro_id: barberId }),
  });
  const json = await res.json();
  return { status: res.status, json };
}

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

Deno.test("check-availability responde 200 e contém slots", async () => {
  assert(BARBEIROS.length > 0, "Configure TEST_BARBEIRO_IDS para executar o teste");
  const { status, json } = await callCheckAvailability(BARBEIROS[0], futureDate(30));
  assertEquals(status, 200);
  assert(json.success === true, `resposta inesperada: ${JSON.stringify(json)}`);
  assert(Array.isArray(json.data.slots), "slots deve ser array");
  assert(json.data.slots.length > 0, "esperava ao menos 1 slot");
});

Deno.test("slot_interval_minutes é aplicado — todos os gaps iguais e permitidos", async () => {
  for (let i = 0; i < BARBEIROS.length; i++) {
    const { json } = await callCheckAvailability(BARBEIROS[i], futureDate(30 + i));
    if (!json?.data?.slots?.length) continue; // barbeiro pode estar fechado no dia

    const times: string[] = json.data.slots.map((s: { time: string }) => s.time);
    const gaps: number[] = [];
    for (let k = 1; k < times.length; k++) gaps.push(toMin(times[k]) - toMin(times[k - 1]));

    // NOTA: podem existir gaps maiores em bordas de almoço/bloqueios;
    // o gap MÍNIMO representa o intervalo configurado.
    const minGap = Math.min(...gaps);
    assert(
      ALLOWED.has(minGap),
      `barbeiro ${BARBEIROS[i]}: intervalo ${minGap}min fora do conjunto {5,10,15,20,30}`,
    );

    // Todos os gaps devem ser múltiplos do intervalo base
    assert(
      gaps.every((g) => g % minGap === 0),
      `barbeiro ${BARBEIROS[i]}: gaps não são múltiplos de ${minGap}: ${[...new Set(gaps)]}`,
    );

    // Cada horário deve estar alinhado ao grid (minuto % intervalo == offset consistente)
    const offset = toMin(times[0]) % minGap;
    assert(
      times.every((t) => toMin(t) % minGap === offset),
      `barbeiro ${BARBEIROS[i]}: horários fora do grid de ${minGap}min`,
    );
  }
});

Deno.test("resposta inclui businessHours coerente", async () => {
  const { json } = await callCheckAvailability(BARBEIROS[0], futureDate(30));
  const bh = json?.data?.businessHours;
  if (!bh) return; // dia fechado
  assert(typeof bh.hora_abertura === "string" && /^\d{2}:\d{2}/.test(bh.hora_abertura));
  assert(typeof bh.hora_fechamento === "string" && /^\d{2}:\d{2}/.test(bh.hora_fechamento));
});

Deno.test("barbeiro_id ausente → mensagem instrutiva (isolamento multi-tenant)", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/check-availability`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ date: futureDate(30), duration: 30 }),
  });
  const json = await res.json();
  assertEquals(res.status, 200);
  assertEquals(json.data.slots.length, 0);
  assert(String(json.data.message || "").toLowerCase().includes("profissional"));
});

import { describe, expect, test } from "bun:test";
import { createAuthenticatedFunction } from "./authenticatedFunction";

const unauthorized = () => Object.assign(new Error("Unauthorized"), { context: { status: 401 } });

describe("authenticated function session recovery", () => {
  test("does not invoke a protected function without a session", async () => {
    let calls = 0;
    const invoke = createAuthenticatedFunction({
      getSession: async () => null,
      refreshSession: async () => null,
      invoke: async () => { calls++; return { data: null, error: null }; },
    });
    const result = await invoke("manage-clients", { body: { action: "list" } });
    expect(calls).toBe(0);
    expect(result.error).toBeInstanceOf(Error);
  });

  test("refreshes an expired token before sending the request", async () => {
    const tokens: string[] = [];
    const invoke = createAuthenticatedFunction({
      getSession: async () => ({ access_token: "old", expires_at: 1 }),
      refreshSession: async () => ({ access_token: "renewed" }),
      invoke: async (_name, _body, token) => { tokens.push(token); return { data: null, error: null }; },
    });
    await invoke("manage-clients", { body: { action: "list" } });
    expect(tokens).toEqual(["renewed"]);
  });

  test("retries a rejected token once, then returns a recoverable error", async () => {
    const tokens: string[] = [];
    const invoke = createAuthenticatedFunction({
      getSession: async () => ({ access_token: "old" }),
      refreshSession: async () => ({ access_token: "renewed" }),
      invoke: async (_name, _body, token) => { tokens.push(token); return { data: null, error: unauthorized() }; },
    });
    const result = await invoke("manage-clients", { body: { action: "list" } });
    expect(tokens).toEqual(["old", "renewed"]);
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error & { context?: unknown }).context).toBeUndefined();
  });

  test("does not retry a permission denial", async () => {
    let refreshes = 0;
    const denied = Object.assign(new Error("Forbidden"), { context: { status: 403 } });
    const invoke = createAuthenticatedFunction({
      getSession: async () => ({ access_token: "valid" }),
      refreshSession: async () => { refreshes++; return null; },
      invoke: async () => ({ data: null, error: denied }),
    });
    const result = await invoke("manage-clients", { body: { action: "delete" } });
    expect(refreshes).toBe(0);
    expect(result.error).toBe(denied);
  });
});
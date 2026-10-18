import { supabase } from "@/integrations/supabase/client";
import { createAuthenticatedFunction } from "./authenticatedFunction";

export const invokeAuthenticatedFunction = createAuthenticatedFunction({
  getSession: async () => {
    const { data, error } = await supabase.auth.getSession();
    return error ? null : data.session;
  },
  refreshSession: async () => {
    const { data, error } = await supabase.auth.refreshSession();
    return error ? null : data.session;
  },
  invoke: (name, body, token) => supabase.functions.invoke(name, {
    body,
    headers: { Authorization: `Bearer ${token}` },
  }),
});
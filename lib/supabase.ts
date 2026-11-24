import { createClient } from "@supabase/supabase-js";

/** Le client Supabase ajoute lui-même /rest/v1. On retire ce suffixe s'il est présent dans l'URL. */
export function supabaseProjectUrl(raw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") {
  return raw.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
}

export const supabase = createClient(
  supabaseProjectUrl(),
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  },
);

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Cliente Supabase para Server Components, Route Handlers e Server Actions.
 *
 * No Next.js 15 `cookies()` é assíncrono, por isso esta função é async.
 * Server Components não podem escrever cookies — daí o try/catch no setAll:
 * quem renova a sessão é o middleware, e ali a escrita funciona.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component: ignorado de propósito. O middleware cuida disso.
        }
      },
    },
  });
}

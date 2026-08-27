"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/** Cliente Supabase para componentes que rodam no navegador. */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}

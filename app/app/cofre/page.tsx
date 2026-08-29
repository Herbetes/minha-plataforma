import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CofreClient, { type Documento, type Pasta } from "./cofre-client";

export const dynamic = "force-dynamic";

export default async function CofrePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [documentos, pastas] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, status, pages, chunk_count, error, folder_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("folders")
      .select("id, name")
      .eq("user_id", user.id)
      .order("name", { ascending: true }),
  ]);

  return (
    <CofreClient
      email={user.email ?? ""}
      documentosIniciais={(documentos.data ?? []) as Documento[]}
      pastasIniciais={(pastas.data ?? []) as Pasta[]}
    />
  );
}

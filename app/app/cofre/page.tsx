import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CofreClient, { type Documento } from "./cofre-client";

export const dynamic = "force-dynamic";

export default async function CofrePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data } = await supabase
    .from("documents")
    .select("id, title, status, pages, chunk_count, error, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <CofreClient
      email={user.email ?? ""}
      documentosIniciais={(data ?? []) as Documento[]}
    />
  );
}

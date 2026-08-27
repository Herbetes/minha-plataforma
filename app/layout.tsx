import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Minha Plataforma",
  description: "Portal de operações do Grupo",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}

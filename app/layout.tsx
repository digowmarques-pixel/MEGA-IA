import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MEGA HUB AI",
  description: "Hub de criação com IA da Mega — imagens, vídeos, áudio e projetos.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}

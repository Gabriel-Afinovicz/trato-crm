import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CRM",
  description: "Sistema de gestão de leads para o seu negócio",
};

// `suppressHydrationWarning` no <body> evita warnings de hidratacao causados
// por extensoes de browser que injetam atributos antes do React hidratar
// (ex.: ColorZilla insere `cz-shortcut-listen`; Grammarly insere
// `data-gr-ext-installed`; etc). O escopo da flag e apenas ATRIBUTOS deste
// elemento — desvios reais em filhos continuam sendo reportados.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        className="min-h-full bg-gray-50 font-sans"
        suppressHydrationWarning
      >
        {children}
        <div className="fixed inset-x-0 bottom-0 z-50 bg-yellow-300 px-2 py-px text-center text-[9px] font-medium leading-tight text-yellow-900">
          CRM em versão beta — em constante atualização.
        </div>
        {/* Toaster global do sonner. richColors aplica paleta padrao
            (success/error/info) e closeButton mostra X em cada toast.
            position no canto inferior direito para nao competir com a
            header global no topo. */}
        <Toaster
          richColors
          closeButton
          position="bottom-right"
          toastOptions={{
            duration: 4000,
          }}
        />
      </body>
    </html>
  );
}

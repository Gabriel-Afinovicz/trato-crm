import type { Metadata } from "next";
import { AjudaClient } from "./ajuda-client";

export const metadata: Metadata = {
  title: "Central de Ajuda & Tutoriais · Trato CRM",
  description:
    "Aprenda a otimizar, configurar e usar todos os diferenciais do Trato CRM: Dashboard, Leads, Agenda, Conversas (WhatsApp) e atalhos de produtividade.",
};

interface AjudaPageProps {
  searchParams: Promise<{ d?: string }>;
}

export default async function AjudaPage({ searchParams }: AjudaPageProps) {
  const { d } = await searchParams;

  return <AjudaClient domain={d} />;
}

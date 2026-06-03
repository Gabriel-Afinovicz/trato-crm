import Image from "next/image";
import { LoginForm } from "@/components/login-form";

interface LoginPageProps {
  params: Promise<{ domain: string }>;
}

export default async function LoginPage({ params }: LoginPageProps) {
  const { domain } = await params;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white px-4">
      {/* Gradiente azul ancorado na base da tela, esmaecendo para transparente
          antes de chegar no card — fica "abaixo" do card sem invadi-lo. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-blue-600/30 via-blue-500/10 to-transparent" />
      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-8 text-center">
          <Image
            src="/trato-crm-logo.png"
            alt="Trato CRM"
            width={727}
            height={195}
            className="mx-auto mb-4 h-12 w-auto"
            priority
          />
          <p className="mt-1 text-sm text-gray-500">
            Acesse sua conta com ramal e senha
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <LoginForm domain={domain} />
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          Organização: {domain}
        </p>
      </div>
    </div>
  );
}

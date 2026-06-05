import Image from "next/image";
import { LoginForm } from "@/components/login-form";

interface LoginPageProps {
  params: Promise<{ domain: string }>;
}

export default async function LoginPage({ params }: LoginPageProps) {
  const { domain } = await params;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white px-4">
      {/* Cores suaves nos cantos (Órbitas lentas) */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-blue-500/8 blur-[100px] animate-orbit-1" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-indigo-500/8 blur-[100px] animate-orbit-2" />
      
      {/* Malha Quadriculada que some gradientemente no centro */}
      <div className="pointer-events-none absolute inset-0 grid-pattern-masked" />

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
          <p className="mt-1 text-sm text-slate-500 font-medium">
            Acesse sua conta com ramal e senha
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200/80 bg-white/80 p-8 shadow-[0_20px_40px_rgba(0,0,0,0.04)] backdrop-blur-md">
          <LoginForm domain={domain} />
        </div>

        <p className="mt-5 text-center text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Organização · <span className="text-blue-600 font-bold">{domain}</span>
        </p>
      </div>
    </div>
  );
}



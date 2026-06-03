import Image from "next/image";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <Image
          src="/trato-crm-logo.png"
          alt="Trato CRM"
          width={727}
          height={195}
          className="mx-auto mb-6 h-16 w-auto"
          priority
        />
        <p className="mt-2 text-gray-500">
          Acesse pela URL da sua organização para fazer login.
        </p>
        <p className="mt-1 text-sm text-gray-400">
          Exemplo: app.com/minha-empresa
        </p>
      </div>
    </div>
  );
}

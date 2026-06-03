export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-blue-600 text-2xl font-bold text-white shadow-lg">
          C
        </div>
        <h1 className="text-3xl font-bold text-gray-900">
          CRM
        </h1>
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

import { ResetPasswordForm } from "./reset-password-form";

interface ResetPasswordPageProps {
  params: Promise<{ domain: string }>;
}

export default async function ResetPasswordPage({
  params,
}: ResetPasswordPageProps) {
  const { domain } = await params;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-white px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">
            Redefinir senha
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Crie uma nova senha para o seu acesso.
          </p>

          <div className="mt-6">
            <ResetPasswordForm domain={domain} />
          </div>
        </div>
      </div>
    </div>
  );
}

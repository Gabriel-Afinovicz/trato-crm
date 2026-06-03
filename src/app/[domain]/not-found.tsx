import Link from "next/link";

/**
 * 404 do segmento autenticado `[domain]` — pega URLs validas no formato
 * `/<dominio>/<rota-que-nao-existe>` (ex: `/clinica-x/feature-removida`).
 *
 * Como Next.js renderiza este arquivo dentro do `layout.tsx` do mesmo
 * segmento, mas nao temos o `params.domain` aqui sem usar Client Component
 * (e nem `headers()` resolve facil), mantemos generico e oferecemos voltar
 * ao path `/` (o root layout resolve para o `[domain]/dashboard`).
 */
export default function DomainNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700">
          <span className="text-lg font-bold">404</span>
        </div>
        <h2 className="mt-4 text-lg font-semibold text-gray-900">
          Pagina nao encontrada
        </h2>
        <p className="mt-1.5 text-sm text-gray-600">
          A pagina que voce esta procurando nao existe neste espaco. Use o
          menu lateral para navegar ou volte ao inicio.
        </p>
        <div className="mt-5">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            Voltar ao inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

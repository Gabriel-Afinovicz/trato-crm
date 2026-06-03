import Link from "next/link";

/**
 * 404 raiz — pega URLs que nao casam com nenhuma rota do app
 * (`/[domain]/qualquer-coisa-inexistente`, `/foo`, etc.).
 *
 * Por nao saber a qual `[domain]` o visitante pertence, esta tela so
 * oferece "Voltar ao inicio". O `not-found.tsx` em `[domain]/` cuida
 * dos casos em que ja temos o domain no path.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-700">
          <span className="text-xl font-bold">404</span>
        </div>
        <h1 className="mt-4 text-xl font-semibold text-gray-900">
          Pagina nao encontrada
        </h1>
        <p className="mt-1.5 text-sm text-gray-600">
          O endereco que voce tentou acessar nao existe ou foi movido.
          Confira o link ou volte para a tela inicial.
        </p>
        <div className="mt-6">
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

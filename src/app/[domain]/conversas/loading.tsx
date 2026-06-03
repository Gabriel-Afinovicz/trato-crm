/**
 * Skeleton mostrado enquanto o RSC de /conversas carrega (resolucao de
 * companyId, leitura inicial de instancia/conversas). Imita o layout de
 * duas colunas (lista + chat aberto) para evitar "flash" na transicao.
 */
export default function ConversasLoading() {
  return (
    <div className="flex h-full overflow-hidden">
      {/* Coluna lateral (lista de conversas) */}
      <aside className="hidden w-80 flex-col border-r border-gray-200 bg-white sm:flex">
        <div className="flex h-14 items-center gap-3 border-b border-gray-100 px-4">
          <div className="h-8 w-8 animate-pulse rounded-full bg-gray-200" />
          <div className="flex-1">
            <div className="h-3 w-24 animate-pulse rounded bg-gray-200" />
            <div className="mt-1 h-2 w-16 animate-pulse rounded bg-gray-100" />
          </div>
        </div>

        <div className="border-b border-gray-100 px-3 py-2">
          <div className="h-9 animate-pulse rounded-md bg-gray-100" />
        </div>

        <div className="flex-1 divide-y divide-gray-50 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-3 py-3">
              <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="h-3 w-32 animate-pulse rounded bg-gray-200" />
                  <div className="h-2 w-8 animate-pulse rounded bg-gray-100" />
                </div>
                <div className="mt-2 h-2 w-3/4 animate-pulse rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Painel direito (chat) */}
      <section className="flex flex-1 flex-col bg-gray-50">
        <div className="flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-4">
          <div className="h-9 w-9 animate-pulse rounded-full bg-gray-200" />
          <div>
            <div className="h-3 w-36 animate-pulse rounded bg-gray-200" />
            <div className="mt-1 h-2 w-24 animate-pulse rounded bg-gray-100" />
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-hidden px-6 py-4">
          {[60, 40, 80, 30, 70, 50, 90].map((widthPct, i) => {
            const isMine = i % 2 === 1;
            return (
              <div
                key={i}
                className={`flex ${isMine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className="h-10 animate-pulse rounded-2xl bg-gray-200"
                  style={{ width: `${widthPct}%`, maxWidth: 360 }}
                />
              </div>
            );
          })}
        </div>

        <div className="border-t border-gray-200 bg-white px-4 py-3">
          <div className="h-10 animate-pulse rounded-lg bg-gray-100" />
        </div>
      </section>
    </div>
  );
}

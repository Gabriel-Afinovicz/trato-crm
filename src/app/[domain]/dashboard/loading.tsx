export default function DashboardLoading() {
  return (
    // O AppShell já renderiza a barra global do usuário; o loading
    // mostra só o esqueleto do conteúdo abaixo dela.
    <div className="min-h-full">
      <main className="p-6 lg:p-8">
        <div className="mb-8">
          <div className="h-7 w-48 animate-pulse rounded bg-gray-200" />
          <div className="mt-2 h-4 w-72 animate-pulse rounded bg-gray-100" />
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>

        <div className="h-96 animate-pulse rounded-xl bg-gray-100" />
      </main>
    </div>
  );
}

"use client";

import Link from "next/link";

interface AgendaEmptyStateProps {
  /** Domain da organizacao para montar o link das configuracoes. */
  domain: string;
}

/**
 * Empty state exibido na area principal da agenda quando a organizacao
 * ainda nao configurou `clinic_hours`. Mantem o mesmo padrao visual do
 * `PipelineTemplateEmptyState` (card centralizado, borda tracejada azul)
 * para que toda jornada "primeira vez" do CRM tenha a mesma identidade.
 *
 * Direciona o usuario para `Configuracoes > Horarios` (`?tab=hours`),
 * onde o `ClinicHoursManager` permite habilitar dias da semana e definir
 * faixas de funcionamento.
 */
export function AgendaEmptyState({ domain }: AgendaEmptyStateProps) {
  return (
    <div className="flex min-h-[420px] flex-1 items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-3xl flex-col items-center gap-5 rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 px-8 py-10 text-center shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
          <svg
            className="h-7 w-7 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.8}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
            />
          </svg>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Sua agenda ainda não está habilitada
          </h3>
          <p className="mt-1.5 max-w-xl text-sm text-gray-600">
            Para começar a agendar atendimentos, defina os horários de
            funcionamento da sua organização em{" "}
            <span className="font-medium text-gray-700">
              Configurações &gt; Horários
            </span>
            . Você pode habilitar cada dia da semana com faixas de abertura e
            intervalos.
          </p>
        </div>

        {/* Mini checklist do que estará disponível ao configurar */}
        <ul className="w-full max-w-md space-y-2 text-left text-xs text-gray-600">
          <li className="flex items-start gap-2">
            <Check />
            <span>
              <span className="font-medium text-gray-800">Faixas por dia</span>{" "}
              da semana (abertura, fechamento e intervalos).
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Check />
            <span>
              <span className="font-medium text-gray-800">Bloqueios</span> de
              data (feriados, folgas e indisponibilidades).
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Check />
            <span>
              <span className="font-medium text-gray-800">
                Conflitos automáticos
              </span>{" "}
              ao agendar fora do horário ou em sobreposição.
            </span>
          </li>
        </ul>

        <Link
          href={`/${domain}/settings?tab=hours`}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.894.149c-.424.07-.764.383-.929.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 0 1-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 0 1-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 0 1 .12-1.45l.773-.773a1.125 1.125 0 0 1 1.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894Z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
            />
          </svg>
          Ir para configurações
        </Link>
      </div>
    </div>
  );
}

function Check() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2.2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m4.5 12.75 6 6 9-13.5"
      />
    </svg>
  );
}

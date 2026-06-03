/**
 * Pequeno icone "?" que mostra explicacao curta no hover (`title` nativo).
 *
 * Usado ao lado de labels com termos do produto que nao sao auto-evidentes
 * para o usuario novo — "Setor", "Funcao", "Pipeline", "Etapa", etc. A
 * versao com `title` cobre 100% dos casos sem dependencia de lib de
 * popover; em uma evolucao futura podemos trocar por um popover real
 * mantendo a mesma API.
 *
 * Uso:
 *
 *   <label className="flex items-center">
 *     Setor
 *     <HelpIcon>Departamento/area que agrupa membros e leads.</HelpIcon>
 *   </label>
 */
export function HelpIcon({ children }: { children: string }) {
  return (
    <span
      className="ml-1 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-gray-300 align-middle text-[9px] font-semibold leading-none text-gray-500 hover:border-gray-400 hover:text-gray-700"
      title={children}
      aria-label={children}
      role="img"
    >
      ?
    </span>
  );
}

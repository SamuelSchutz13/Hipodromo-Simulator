import { brl, type BetType, typeLabel } from "@/components/booth"

type Item = { race: number; horse: string; type: BetType; amount: number; payout: number }

// Chalkboard hanging from a nail, with the latest bets written in chalk.
export function HistoryBoard({ history }: { history: Item[] }) {
  return (
    <section aria-label="Histórico de apostas">
      {/* nail and rope */}
      <svg viewBox="0 0 200 34" className="mx-auto -mb-1 block h-8 w-44" aria-hidden>
        <path d="M20 34 L100 6 L180 34" fill="none" stroke="#a16207" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="100" cy="6" r="4.5" fill="#71717a" stroke="#3f3f46" strokeWidth="1.5" />
      </svg>
      <div className="board-frame rounded-md p-2.5 shadow-xl">
        <div className="chalkboard rounded-sm px-3 py-2.5">
          <h2 className="chalk-text mb-2 border-b border-dashed border-white/30 pb-1 text-center text-lg tracking-wider">
            Últimos Páreos
          </h2>
          {history.length === 0 ? (
            <p className="chalk-text py-3 text-center text-sm opacity-70">Nenhuma aposta ainda...</p>
          ) : (
            <ul className="space-y-1.5">
              {history.map((h, i) => {
                const won = h.payout > 0
                return (
                  <li key={i} className="chalk-text flex items-baseline gap-2 text-sm">
                    <span className="shrink-0 opacity-60">#{h.race}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate" title={h.horse}>
                        {h.horse}
                      </span>
                      <span className="block text-xs opacity-60">
                        {typeLabel[h.type]} · {brl(h.amount)}
                      </span>
                    </span>
                    <span className={won ? "chalk-green shrink-0" : "chalk-red shrink-0"}>
                      {won ? `+${brl(h.payout - h.amount)} ✓` : `-${brl(h.amount)} ✗`}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        {/* ledge with chalk and eraser */}
        <div className="relative mx-1 mt-1.5 h-2.5 rounded-sm bg-amber-900" aria-hidden>
          <span className="absolute -top-1 left-6 h-1.5 w-7 rounded-full bg-stone-100" />
          <span className="absolute -top-2 right-6 h-2.5 w-10 rounded-sm bg-gradient-to-b from-amber-700 to-stone-700" />
        </div>
      </div>
    </section>
  )
}

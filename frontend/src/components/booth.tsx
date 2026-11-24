import { type Horse, Silk } from "@/components/track"
import { cn } from "@/lib/utils"

export type BetType = "win" | "place" | "dupla"
export const typeLabel = { win: "Vencedor", place: "Placê", dupla: "Dupla" }
const typeHelp = {
  win: "Ganha se o cavalo chegar em 1º.",
  place: "Ganha se chegar em 1º ou 2º. Odd menor, mais chance.",
  dupla: "Escolha 2 cavalos: ganha se forem 1º e 2º, em qualquer ordem.",
}
// Money from the server is in centavos.
export const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

const chips = [
  { v: 5, bg: "#dc2626" },
  { v: 10, bg: "#2563eb" },
  { v: 25, bg: "#16a34a" },
  { v: 50, bg: "#18181b" },
]

export type Ticket = {
  raceId: number
  picks: Horse[]
  type: BetType
  amount: number
  odds: number
  // undefined while the race is running
  result?: { won: boolean; payout: number }
}

type Props = {
  balance: number // in reais
  betType: BetType
  onType: (t: BetType) => void
  picks: Horse[]
  needed: number
  odds: number | null
  amount: string
  setAmount: (v: string) => void
  busy: boolean
  error: string
  onBet: () => void
  ticket: Ticket | null // shown instead of the slip while racing and after the result
  tip: string | null // Seu Zé's explanation for the horse he suggested
  onTip: () => void
}

// What the bookmaker says, depending on what the player is doing.
function bookieLine(p: Props) {
  const t = p.ticket
  if (t?.result) return t.result.won ? `Parabéns! Pode retirar ${brl(t.result.payout)}! 🤑` : "Hoje não deu... a próxima é tua!"
  if (t) return "Bilhete na mão! Boa sorte, campeão!"
  if (p.tip) return p.tip
  if (p.balance < 1) return "Ih, a carteira secou. Recarrega lá em cima!"
  if (p.picks.length === 0) return "Chega mais! Escolhe teu cavalo ali no estábulo."
  if (p.picks.length < p.needed) return "Falta mais um pra fechar a dupla!"
  if (p.odds && p.odds >= 10) return `Zebra, hein? Tá pagando ${p.odds.toFixed(2)}! 🦓`
  if (p.odds) return `${p.picks.map((h) => h.name).join(" e ")} tá pagando ${p.odds.toFixed(2)}. Vai?`
  return "Faça sua fé!"
}

export function BettingBooth(p: Props) {
  const value = Math.round(Number(p.amount) * 100) / 100 || 0 // reais, up to 2 decimals
  const addChip = (v: number) => p.setAmount(String(Math.min(value + v, p.balance)))
  return (
    <div className="overflow-hidden rounded-xl border border-amber-900/50 bg-card shadow-lg">
      {/* striped awning with scalloped edge */}
      <div className="awning h-10" />
      <div className="awning awning-scallop h-3.5" />

      <div className="booth-wood relative mx-3 -mt-1 rounded-b-md px-3 pt-3 pb-4">
        <div className="mx-auto -mt-1 mb-3 w-fit rounded border-2 border-amber-300/70 bg-stone-900 px-4 py-1 text-center font-black tracking-[0.25em] text-amber-300 shadow">
          APOSTAS
        </div>

        {/* bookmaker */}
        <div className="mb-3 flex items-end gap-2">
          <div className="flex flex-col items-center">
            <span className="text-4xl leading-none" aria-hidden>
              🧔
            </span>
            <span className="mt-0.5 text-[10px] font-semibold text-amber-100/80">Seu Zé</span>
          </div>
          <div
            key={bookieLine(p)}
            className="bubble animate-in fade-in slide-in-from-left-2 relative flex-1 rounded-lg bg-white px-3 py-2 text-sm text-stone-900 shadow"
            aria-live="polite"
          >
            {bookieLine(p)}
          </div>
        </div>

        {!p.ticket && (
          <button onClick={p.onTip} disabled={p.busy} className="tip-btn mb-3 w-full">
            💡 Pedir um palpite ao Seu Zé
          </button>
        )}

        {p.ticket ? (
          <TicketView t={p.ticket} />
        ) : (
          <div className="space-y-3 rounded-md bg-stone-950/70 p-3">
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/40 p-1">
              {(["win", "place", "dupla"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => p.onType(t)}
                  disabled={p.busy}
                  aria-pressed={p.betType === t}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-sm transition",
                    p.betType === t ? "bg-amber-400 font-semibold text-stone-900" : "text-stone-300 hover:text-white",
                  )}
                >
                  {typeLabel[t]}
                </button>
              ))}
            </div>
            <p className="text-xs text-stone-400">{typeHelp[p.betType]}</p>

            {p.picks.length > 0 && (
              <div className="space-y-1">
                {p.picks.map((h) => (
                  <div key={h.id} className="flex items-center gap-2 text-sm">
                    <Silk color={h.color} n={h.id + 1} />
                    <span className="flex-1 truncate">{h.name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* casino chips add up; the input still allows any value */}
            <div className="flex items-center justify-between gap-1">
              {chips.map((c) => (
                <button
                  key={c.v}
                  onClick={() => addChip(c.v)}
                  disabled={p.busy}
                  className="chip"
                  style={{ background: c.bg }}
                  aria-label={`Adicionar ${c.v} reais`}
                >
                  {c.v}
                </button>
              ))}
              <button onClick={() => p.setAmount(String(p.balance))} disabled={p.busy} className="chip chip-gold" aria-label="Apostar tudo">
                TUDO
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-stone-400">R$</span>
              <input
                type="number"
                min={1}
                value={p.amount}
                onChange={(e) => p.setAmount(e.target.value)}
                disabled={p.busy}
                aria-label="Valor da aposta"
                className="w-full rounded-md border border-stone-700 bg-stone-900 px-2 py-1.5 font-mono text-lg"
              />
              <button onClick={() => p.setAmount("0")} disabled={p.busy} className="text-xs text-stone-400 underline hover:text-white">
                limpar
              </button>
            </div>

            {p.odds !== null && (
              <div className="flex justify-between text-sm">
                <span className="text-stone-400">
                  Odd <span className="font-mono font-semibold text-amber-400">{p.odds.toFixed(2)}</span>
                </span>
                <span className="text-stone-400">
                  Retorno <span className="font-semibold text-emerald-400">{brl(Math.round(value * 100 * p.odds))}</span>
                </span>
              </div>
            )}
            {p.error && <p className="text-sm text-red-400">{p.error}</p>}
            <button
              onClick={p.onBet}
              disabled={p.odds === null || p.busy || value < 1}
              className="w-full rounded-md bg-gradient-to-b from-amber-300 to-amber-500 py-2.5 font-black tracking-wide text-stone-900 shadow transition hover:brightness-110 disabled:opacity-40"
            >
              🎟️ APOSTAR E LARGAR
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function TicketView({ t }: { t: Ticket }) {
  return (
    <div className="ticket animate-in slide-in-from-top-4 fade-in relative rounded-sm px-4 py-3 font-mono text-sm text-stone-900 shadow-md duration-500">
      <div className="text-center text-xs font-bold tracking-widest">HIPÓDROMO VIRTUAL</div>
      <div className="mb-2 text-center text-[10px] text-stone-500">BILHETE DE APOSTA</div>
      <div className="flex justify-between border-t border-dashed border-stone-400 pt-2">
        <span>Páreo</span>
        <span>#{t.raceId}</span>
      </div>
      <div className="flex justify-between">
        <span>Tipo</span>
        <span>{typeLabel[t.type]}</span>
      </div>
      {t.picks.map((h) => (
        <div key={h.id} className="flex justify-between gap-2">
          <span>Cavalo {h.id + 1}</span>
          <span className="truncate">{h.name}</span>
        </div>
      ))}
      <div className="flex justify-between">
        <span>Valor</span>
        <span>{brl(t.amount)}</span>
      </div>
      <div className="flex justify-between font-bold">
        <span>Odd</span>
        <span>{t.odds.toFixed(2)}</span>
      </div>
      <div className="barcode mt-2 h-8" aria-hidden />
      {t.result && (
        <div
          className={cn(
            "animate-in zoom-in-150 fade-in absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-md bg-white/70 border-4 px-3 py-1 text-center font-black tracking-wider uppercase duration-300",
            t.result.won ? "border-emerald-600 text-emerald-600" : "border-red-600 text-red-600",
          )}
        >
          {t.result.won ? `PAGO ${brl(t.result.payout)}` : "NÃO PREMIADO"}
        </div>
      )}
    </div>
  )
}

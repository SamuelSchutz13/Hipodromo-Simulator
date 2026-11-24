import { type BetType, isOrdered } from "@/components/booth"
import { type Horse, HorseSprite } from "@/components/track"
import { cn } from "@/lib/utils"

type Props = {
  horses: Horse[]
  surface: string
  picked: number[] // in the order clicked
  betType: BetType
  gp: boolean
  disabled: boolean
  onPick: (h: Horse) => void
}

const formColor = (pos: number) =>
  pos === 1 ? "bg-amber-400 text-stone-900" : pos === 2 ? "bg-zinc-300 text-stone-900" : pos === 3 ? "bg-orange-700 text-white" : "bg-black/50 text-white/80"

// The race card as a barn: one wooden stall per horse, with a half door, brass name plate, jockey and chalk odds.
export function Stable({ horses, surface, picked, betType, gp, disabled, onPick }: Props) {
  return (
    <section className="overflow-hidden rounded-xl border border-red-950 bg-card shadow-lg" aria-label="Estábulo">
      {/* gable roof with sign */}
      <div className="relative h-16">
        <div className="barn-roof absolute inset-0" />
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded border-2 border-amber-200/80 bg-stone-900 px-4 py-0.5 font-black tracking-[0.3em] whitespace-nowrap text-amber-200 shadow">
          {gp ? "🏆 GRANDE PRÊMIO" : "ESTÁBULO"}
        </div>
      </div>

      <div className="barn-wall grid grid-cols-2 gap-3 p-3 sm:grid-cols-3">
        {horses.map((h) => {
          const on = picked.includes(h.id)
          const order = picked.indexOf(h.id) + 1
          return (
            <button
              key={h.id}
              onClick={() => onPick(h)}
              disabled={disabled}
              aria-pressed={on}
              aria-label={`${h.name}, número ${h.id + 1}, vencedor ${h.odds.toFixed(2)}, placê ${h.placeOdds.toFixed(2)}`}
              className={cn(
                "stall group relative flex flex-col overflow-hidden rounded-md border-4 text-left transition disabled:opacity-60",
                on ? "border-amber-400 shadow-[0_0_18px_rgb(251_191_36_/_0.45)]" : "border-amber-950 hover:border-amber-700",
              )}
            >
              {/* brass name plate */}
              <div className="relative z-10 mx-2 mt-2 flex items-center gap-1.5 rounded-sm bg-gradient-to-b from-amber-200 to-amber-500 px-1.5 py-0.5 text-stone-900 shadow">
                <span
                  className="flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ background: h.color }}
                >
                  {h.id + 1}
                </span>
                <span className="truncate text-xs font-bold">{h.name}</span>
              </div>
              {/* jockey and skill */}
              <div className="relative z-10 mx-2 mt-1 flex items-center justify-between text-[10px] text-amber-100/90">
                <span className="truncate">🏇 {h.jockey}</span>
                <span className="text-amber-300" aria-label={`${h.jockeyStars} de 5 estrelas`}>
                  {"★".repeat(h.jockeyStars)}
                  <span className="text-white/25">{"★".repeat(5 - h.jockeyStars)}</span>
                </span>
              </div>
              {on && (
                <span className="lantern absolute top-1 right-1 z-10 text-lg" aria-hidden>
                  🏮
                </span>
              )}
              {on && isOrdered(betType) && (
                <span className="absolute top-12 left-2 z-20 rounded-md bg-amber-400 px-1.5 font-mono text-sm font-black text-stone-900 shadow">
                  {order}º
                </span>
              )}

              {/* horse in the stall, legs hidden behind the half door */}
              <div className="relative h-24">
                <div className="idle absolute bottom-0 left-1/2 -translate-x-1/2 scale-[1.6] origin-bottom group-hover:[animation-duration:0.5s]">
                  <HorseSprite horse={h} running={false} />
                </div>
              </div>

              {/* half door with X brace; chalk odds and hints on it */}
              <div className="stall-door relative z-10 -mt-7 px-2 pt-2 pb-1">
                <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden>
                  <path d="M4 6 L96 94 M96 6 L4 94" stroke="#3b1d0a" strokeWidth="7" opacity="0.55" />
                  <rect x="2" y="3" width="96" height="94" fill="none" stroke="#3b1d0a" strokeWidth="5" opacity="0.6" />
                </svg>
                <div className="relative flex justify-center gap-1.5 font-mono text-[11px]">
                  <span className={cn("chalk", betType === "win" && "chalk-on")}>V {h.odds.toFixed(2)}</span>
                  <span className={cn("chalk", betType === "place" && "chalk-on")}>P {h.placeOdds.toFixed(2)}</span>
                </div>
                <div className="relative mt-1 flex min-h-5 flex-wrap items-center justify-center gap-x-1.5 gap-y-3 pb-2 text-[10px]">
                  {h.specialist && (
                    <span className="medal-tag" title={h.pref === surface ? `Hoje é na ${surface}, a pista preferida dele!` : `Corre melhor na ${h.pref}`}>
                      🏅 bom na {h.pref}
                      {h.pref === surface && " ✓"}
                    </span>
                  )}
                  {h.mudder && <span className="mud-tag" title="Corre melhor em pista molhada ou pesada">
                      <MuddyShoe />
                      gosta de lama
                    </span>}
                  {h.stayer && <span className="stamina-tag" title="Aguenta bem as corridas longas">💪 fôlego longo</span>}
                </div>
                {/* form: last finishing positions, most recent first */}
                <div className="relative flex items-center justify-center gap-1 pb-1 font-mono text-[10px]" title="Últimas corridas (mais recente primeiro)">
                  <span className="text-amber-100/80">Últimas:</span>
                  {h.form?.length ? (
                    h.form.map((pos, i) => (
                      <span key={i} className={cn("rounded px-1 font-bold", formColor(pos))}>
                        {pos}º
                      </span>
                    ))
                  ) : (
                    <span className="text-amber-100/60">estreante</span>
                  )}
                </div>
              </div>
              <div className="hay h-2.5" aria-hidden />
            </button>
          )
        })}
      </div>
    </section>
  )
}

// Small horseshoe with nail holes and mud caked on the toe.
function MuddyShoe() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" aria-hidden>
      <path d="M3.5 2 C3 9, 5 13.5, 8 13.5 C11 13.5, 13 9, 12.5 2" fill="none" stroke="#3f3f46" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M3.5 2 C3 9, 5 13.5, 8 13.5 C11 13.5, 13 9, 12.5 2" fill="none" stroke="#e7e5e4" strokeWidth="1.6" strokeLinecap="round" />
      {[ [4, 5], [4.6, 9], [12, 5], [11.4, 9] ].map(([x, y]) => (
        <circle key={x + "-" + y} cx={x} cy={y} r="0.6" fill="#3f3f46" />
      ))}
      <path d="M4.5 11.5 C6 15, 10 15, 11.5 11.5 C10 13, 6 13, 4.5 11.5 Z" fill="#4a2c14" />
      <circle cx="13.6" cy="12.8" r="0.9" fill="#4a2c14" />
    </svg>
  )
}

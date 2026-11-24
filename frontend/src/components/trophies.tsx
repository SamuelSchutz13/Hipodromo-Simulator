import { useState } from "react"
import { cn } from "@/lib/utils"

// Achievement IDs come from the server; titles and icons live here.
export const ACHIEVEMENTS: Record<string, { icon: string; title: string; desc: string }> = {
  first_win: { icon: "🏆", title: "Primeira vitória", desc: "Ganhe sua primeira aposta" },
  zebra: { icon: "🦓", title: "Deu zebra!", desc: "Ganhe com odd 10 ou mais" },
  photo: { icon: "📸", title: "Por um focinho", desc: "Ganhe num photo finish" },
  streak3: { icon: "🔥", title: "Em chamas", desc: "Ganhe 3 apostas seguidas" },
  double: { icon: "💰", title: "Dobrou a banca", desc: "Chegue a R$ 200" },
  allin: { icon: "🎲", title: "Tudo ou nada", desc: "Ganhe apostando todo o saldo" },
  mud: { icon: "🌧️", title: "Debaixo de chuva", desc: "Ganhe numa pista pesada" },
  barro: { icon: "🐷", title: "Rei do barro", desc: "Ganhe na terra molhada ou no barro" },
  dupla: { icon: "🎯", title: "Dupla certeira", desc: "Acerte uma dupla" },
  marathon: { icon: "🏃", title: "Fundista", desc: "Ganhe uma corrida de 1600 m" },
  all_tracks: { icon: "🗺️", title: "Pé em todo chão", desc: "Ganhe na grama, na areia e na terra" },
  regular: { icon: "🎟️", title: "Frequentador", desc: "Faça 25 apostas" },
  gp: { icon: "👑", title: "Campeão do GP", desc: "Ganhe uma aposta no Grande Prêmio" },
  trifeta: { icon: "🎰", title: "Na mosca", desc: "Acerte uma trifeta" },
}

// Glass trophy cabinet: medals on wooden shelves, locked ones as padlocked silhouettes.
export function TrophyCase({ unlocked }: { unlocked: string[] }) {
  const [active, setActive] = useState<string | null>(null)
  const entries = Object.entries(ACHIEVEMENTS)
  const shelves = Array.from({ length: Math.ceil(entries.length / 4) }, (_, i) => entries.slice(i * 4, i * 4 + 4))
  const a = active ? ACHIEVEMENTS[active] : null
  const has = (id: string) => unlocked.includes(id)

  return (
    <section className="cabinet rounded-xl p-2.5 shadow-lg" aria-label="Estante de troféus">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="font-black tracking-widest text-amber-200">🏆 TROFÉUS</h2>
        <span className="font-mono text-sm text-amber-100/80">
          {unlocked.length}/{entries.length}
        </span>
      </div>
      <div className="mb-2 h-2 overflow-hidden rounded-full bg-black/40" aria-hidden>
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500 transition-all duration-700"
          style={{ width: `${(unlocked.length / entries.length) * 100}%` }}
        />
      </div>

      <div className="glass rounded-md">
        {shelves.map((shelf, i) => (
          <div key={i} className="shelf grid grid-cols-4 gap-1 px-1 pt-2">
            {shelf.map(([id, t]) => (
              <button
                key={id}
                onMouseEnter={() => setActive(id)}
                onFocus={() => setActive(id)}
                onClick={() => setActive(id)}
                aria-label={has(id) ? `${t.title}: ${t.desc}` : `Bloqueada: ${t.desc}`}
                className="group flex flex-col items-center pb-1 outline-none"
              >
                <span
                  className={cn(
                    "medal relative flex size-11 items-center justify-center rounded-full text-xl transition group-hover:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-amber-300",
                    has(id) ? "medal-gold" : "medal-locked",
                    active === id && "ring-2 ring-amber-300",
                  )}
                >
                  <span className={cn(!has(id) && "silhouette")}>{t.icon}</span>
                  {!has(id) && <span className="absolute -right-1 -bottom-1 text-xs">🔒</span>}
                </span>
                <span className={cn("mt-1 w-full truncate text-center text-[9px] leading-tight", has(id) ? "text-amber-100" : "text-stone-500")}>
                  {has(id) ? t.title : "???"}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* brass plate describing the hovered trophy */}
      <div className="mt-2 min-h-12 rounded-sm bg-gradient-to-b from-amber-200 to-amber-400 px-2 py-1.5 text-center text-stone-900 shadow" aria-live="polite">
        {a && active ? (
          <>
            <div className="text-sm font-black">{has(active) ? `${a.icon} ${a.title}` : "🔒 Bloqueada"}</div>
            <div className="text-xs">{a.desc}</div>
          </>
        ) : (
          <div className="pt-1.5 text-xs font-semibold">Passe o mouse num troféu para ver como ganhar</div>
        )}
      </div>
    </section>
  )
}

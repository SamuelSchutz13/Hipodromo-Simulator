import { type Horse, HorseSprite } from "@/components/track"
import { cn } from "@/lib/utils"

export type TowerRow = { horse: Horse; info: string }

const ROW = 30 // px per row; rows slide to their new slot when positions change

// F1-style 3-letter codes, unique within the race: "Relâmpago do Sul" -> "REL";
// if two horses share a first name, use 2 letters of it + the first letter of the last word ("PRF", "PRL"), then 1 + 2.
function codes(horses: Horse[]) {
  const clean = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase() // strip accents
  const tries = (name: string) => {
    const words = clean(name).split(" ")
    const first = words[0]
    const last = words[words.length - 1]
    return [first.slice(0, 3), first.slice(0, 2) + last[0], first[0] + last.slice(0, 2), first[0] + last.slice(0, 1) + String(words.length)]
  }
  const out = new Map<number, string>()
  for (const level of [0, 1, 2, 3]) {
    const pending = horses.filter((h) => !out.has(h.id))
    const counts = new Map<string, number>()
    for (const h of pending) counts.set(tries(h.name)[level], (counts.get(tries(h.name)[level]) ?? 0) + 1)
    for (const h of pending) if (counts.get(tries(h.name)[level]) === 1 || level === 3) out.set(h.id, tries(h.name)[level])
  }
  return out
}

// F1-style timing tower: position, silk colour, 3-letter code and gap to the leader.
export function TimingTower({ title, rows, highlight, running }: { title: string; rows: TowerRow[]; highlight: number[]; running: boolean }) {
  const code = codes(rows.map((r) => r.horse))
  return (
    <div className="tower w-48 overflow-hidden rounded-md select-none" aria-label="Classificação">
      <div className="tower-head flex h-8 items-center justify-center text-[11px] font-black tracking-[0.2em] text-white">
        {title}
      </div>
      <ol className="relative" style={{ height: rows.length * ROW }}>
        {rows.map((r, i) => (
          <li
            key={r.horse.id}
            className={cn(
              "absolute inset-x-0 flex items-center gap-1.5 pr-2 font-mono text-xs text-white transition-[top] duration-300 ease-out",
              highlight.includes(r.horse.id) ? "bg-amber-400/25" : i % 2 ? "bg-white/[0.04]" : "",
            )}
            style={{ top: i * ROW, height: ROW }}
            title={r.horse.name}
          >
            <span className="flex h-full w-6 items-center justify-center bg-white font-black text-zinc-900">{i + 1}</span>
            <span className="w-3 text-center text-[10px] text-white/60">{r.horse.id + 1}</span>
            {/* mini horse with its coat and jockey silk; gallops while racing */}
            <span className="flex w-8 shrink-0 justify-center [&>svg]:h-6 [&>svg]:w-8">
              <HorseSprite horse={r.horse} running={running} />
            </span>
            <span className="font-sans font-black tracking-wide">{code.get(r.horse.id)}</span>
            <span className={cn("ml-auto text-[11px] tabular-nums", i === 0 ? "text-amber-300" : "text-white/80")}>{r.info}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

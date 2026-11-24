import { useMemo } from "react"
import { cn } from "@/lib/utils"

export type Horse = {
  id: number
  name: string
  color: string
  coat: string
  odds: number
  placeOdds: number
  mudder: boolean
  specialist: boolean
  stayer: boolean
}

// Horse nose position on the track: from 92px (start gate) to 94% (finish line).
const trackX = (frac: number) => `calc(92px + (94% - 92px) * ${frac})`

// Colour of what the hooves kick up, by surface and ground.
function dustColor(surface: string, going: string) {
  if (surface === "terra") return going === "seca" ? "#b45309" : "#4a2f17"
  if (surface === "areia") return going === "seca" ? "#f5deb3" : "#b89b6a"
  return going === "seca" ? "#86efac" : "#bfdbfe" // grass bits / water spray
}

export function Silk({ color, n }: { color: string; n: number }) {
  return (
    <span
      className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ background: color }}
    >
      {n}
    </span>
  )
}

export function HorseSprite({ horse, running }: { horse: Horse; running: boolean }) {
  return (
    <svg viewBox="0 0 64 48" className={cn("h-12 w-[66px] overflow-visible drop-shadow-[0_0_1.5px_rgb(255_255_255_/_0.75)]", running && "galloping")} aria-hidden>
      {/* tail */}
      <path d="M15 21 C 6 20, 3 30, 5 36" stroke={horse.coat} strokeWidth="3.5" fill="none" strokeLinecap="round" className="tail" />
      {/* legs: back pair and front pair swing in opposite phase */}
      <g fill={horse.coat}>
        <rect className="leg leg-a" x="17" y="26" width="3.5" height="16" rx="1.5" />
        <rect className="leg leg-b" x="21" y="26" width="3.5" height="16" rx="1.5" />
        <rect className="leg leg-b" x="40" y="26" width="3.5" height="16" rx="1.5" />
        <rect className="leg leg-a" x="44" y="26" width="3.5" height="16" rx="1.5" />
      </g>
      {/* body, neck, head */}
      <ellipse cx="31" cy="24" rx="17" ry="8" fill={horse.coat} />
      <path d="M42 22 L50 8 L56 10 L49 26 Z" fill={horse.coat} />
      <ellipse cx="57" cy="11" rx="7" ry="3.6" transform="rotate(25 57 11)" fill={horse.coat} />
      <path d="M50 7 L52 2 L54 7 Z" fill={horse.coat} />
      <path d="M44 11 C 46 6, 49 4, 51 6" stroke="#111" strokeWidth="2" fill="none" />
      {/* saddle cloth with number */}
      <rect x="24" y="17" width="12" height="9" rx="1.5" fill="#fff" />
      <text x="30" y="24.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#111">
        {horse.id + 1}
      </text>
      {/* jockey */}
      <path d="M28 17 L34 7 L40 9 L35 18 Z" fill={horse.color} />
      <path d="M37 10 L45 14" stroke={horse.color} strokeWidth="3" strokeLinecap="round" />
      <circle cx="37" cy="5" r="3.6" fill="#f1c9a5" />
      <path d="M33.4 5 A3.6 3.6 0 0 1 40.6 5 Z" fill={horse.color} />
      <path d="M30 17 L27 25" stroke="#e7e5e4" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export function Track({
  horses,
  positions,
  running,
  betOn,
  going,
  surface,
  distance,
  night,
}: {
  horses: Horse[]
  positions: number[] | null
  running: boolean
  betOn: number[]
  going: string
  surface: string
  distance: number
  night: boolean
}) {
  const marks = Array.from({ length: Math.floor(distance / 200) - 1 }, (_, i) => (i + 1) * 200)
  const dust = dustColor(surface, going)
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border-x-4 border-x-amber-900/60",
        `surf-${surface}-${going}`,
      )}
    >
      {/* night: darkened track under floodlights; sits below the horses so they stay lit */}
      {night && <div className="night pointer-events-none absolute inset-0 z-[4]" />}
      {going !== "seca" && <div className={cn("rain pointer-events-none absolute inset-0 z-10", going === "pesada" && "rain-heavy")} />}
      {marks.map((d) => (
        <div key={d} className="absolute top-0 bottom-0 border-l border-dashed border-white/30" style={{ left: trackX(d / distance) }}>
          <span className="absolute top-3 left-1 font-mono text-[10px] text-white/70">{distance - d}m</span>
        </div>
      ))}
      <div className="absolute top-0 bottom-0 w-px bg-white/60" style={{ left: trackX(0) }} />
      <div className="finish-line absolute top-0 bottom-0 w-2.5" style={{ left: trackX(1) }} />
      <div className="rail h-2.5" aria-hidden />
      {horses.map((h) => {
        const p = positions?.[h.id] ?? 0
        const moving = running && p > 0 && p < distance
        return (
          <div key={h.id} className={cn("relative h-14 border-b border-white/15 last:border-b-0", betOn.includes(h.id) && "bg-white/10")}>
            <span className="absolute top-1/2 left-1.5 -translate-y-1/2 font-mono text-xs text-white/70">
              {betOn.includes(h.id) ? "⭐" : h.id + 1}
            </span>
            {/* starting gate stall; its front door swings open once the race starts */}
            <div className="gate absolute top-1 bottom-1" style={{ left: "18px", width: "74px" }} aria-hidden>
              <span className={cn("gate-door", positions && "gate-open")} />
            </div>
            <div className="absolute top-1/2 z-[5] -translate-x-full -translate-y-1/2" style={{ left: trackX(p / distance) }}>
              {moving && (
                <span className="absolute bottom-0 left-1" aria-hidden>
                  {[0, 1, 2].map((k) => (
                    <span key={k} className="dust" style={{ background: dust, animationDelay: `${k * 0.12}s` }} />
                  ))}
                </span>
              )}
              <HorseSprite horse={h} running={running && p < distance} />
            </div>
          </div>
        )
      })}
      <div className="rail h-2.5" aria-hidden />
    </div>
  )
}

const confettiColors = ["#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#a855f7", "#fde047"]

// Pure-CSS confetti burst; remount (change key) to fire again.
export function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 80 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2 + Math.random() * 1.5,
        color: confettiColors[i % confettiColors.length],
        drift: (Math.random() - 0.5) * 200,
      })),
    [],
  )
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti"
          style={
            {
              left: `${p.left}%`,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              "--drift": `${p.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}


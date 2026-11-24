import { brl } from "@/components/booth"
import { cn } from "@/lib/utils"

export type Mission = { id: string; text: string; goal: number; progress: number; done: boolean }

const REWARD = 15_00 // centavos, same as the server
const XP = 40

// Daily missions on a clipboard: paper sheet with a metal clip, a checkbox and progress per mission.
export function MissionBoard({ missions }: { missions: Mission[] }) {
  const done = missions.filter((m) => m.done).length
  return (
    <section className="clipboard relative rounded-xl px-3 pt-6 pb-3 shadow-lg" aria-label="Missões do dia">
      <div className="clip absolute -top-1 left-1/2 h-6 w-20 -translate-x-1/2 rounded-md" aria-hidden />
      <div className="paper rounded-sm px-3 py-3 text-stone-800">
        <div className="mb-2 flex items-baseline justify-between border-b-2 border-stone-300 pb-1">
          <h2 className="font-black tracking-wide">📋 Missões do dia</h2>
          <span className="font-mono text-xs text-stone-500">
            {done}/{missions.length}
          </span>
        </div>
        <ul className="space-y-2.5">
          {missions.map((m) => (
            <li key={m.id} className="flex items-start gap-2 text-sm">
              <span
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border-2 text-[11px] font-black",
                  m.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-stone-400",
                )}
                aria-hidden
              >
                {m.done && "✓"}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block leading-tight", m.done && "text-stone-400 line-through")}>{m.text}</span>
                <span className="mt-1 flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200">
                    <span
                      className={cn("block h-full rounded-full", m.done ? "bg-emerald-500" : "bg-amber-500")}
                      style={{ width: `${Math.min(100, (m.progress / m.goal) * 100)}%` }}
                    />
                  </span>
                  <span className="font-mono text-[10px] text-stone-500">
                    {Math.min(m.progress, m.goal)}/{m.goal}
                  </span>
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-dashed border-stone-300 pt-2 text-center text-[11px] text-stone-500">
          Cada missão paga <b className="text-emerald-700">{brl(REWARD)}</b> + <b className="text-amber-700">{XP} XP</b> · novas missões amanhã
        </p>
      </div>
    </section>
  )
}

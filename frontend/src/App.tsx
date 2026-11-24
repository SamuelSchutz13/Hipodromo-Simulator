import { useEffect, useRef, useState } from "react"
import { BettingBooth, type BetType, brl, isOrdered, picksNeeded, typeLabel } from "@/components/booth"
import { HistoryBoard } from "@/components/board"
import { type Mission, MissionBoard } from "@/components/missions"
import { Stable } from "@/components/stable"
import { TimingTower, type TowerRow } from "@/components/tower"
import { ACHIEVEMENTS, TrophyCase } from "@/components/trophies"
import { Confetti, type Horse, Silk, Track } from "@/components/track"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  isMusicOn,
  isMuted,
  setMusicMode,
  setMusicOn,
  setMuted,
  sounds,
  speak,
  startHooves,
  stopHooves,
} from "@/lib/sound"
import { cn } from "@/lib/utils"

type HistoryItem = { race: number; horse: string; type: BetType; amount: number; payout: number }
type Stats = {
  bets: number
  wins: number
  staked: number
  returned: number
  bestWin: number
  streak: number
  bestStreak: number
  history: HistoryItem[] | null
  achievements: string[] | null
  xp: number
}
type RaceInfo = { horses: Horse[]; going: string; surface: string; distance: number; night: boolean; gp: boolean }
type RaceState = RaceInfo & {
  raceId: number
  duplaOdds: Record<string, number>
  exataOdds: Record<string, number>
  trifetaOdds: Record<string, number>
  balance: number
  stats: Stats
  missions: Mission[] | null
  nextGP: number // races until the Grande Prêmio; 0 = this one
  bonusAvailable: boolean
  bonusAmount: number
}
type BetResult = {
  frames: number[][]
  order: number[]
  winnerId: number
  won: boolean
  payout: number
  balance: number
  tickMs: number
  gap: number
  unlocked: string[] | null
  levelUp: number
  levelReward: number
  missionsDone: string[] | null
  missionReward: number
}
type Bet ={ raceId: number; picks: Horse[]; amount: number; odds: number; type: BetType; race: RaceInfo }

// Race time as mm:ss.d
const clock = (s: number) => {
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, "0")}:${(s - m * 60).toFixed(1).padStart(4, "0")}`
}
// Final order with each horse's time behind the winner, like F1. Frames are clamped at the line,
// so the crossing moment is extrapolated from the horse's speed over the previous frame.
function finishRows(r: BetResult, info: RaceInfo): TowerRow[] {
  const crossAt = (id: number) => {
    const i = r.frames.findIndex((f) => f[id] >= info.distance)
    if (i < 1) return Math.max(i, 0)
    const prev = r.frames[i - 1][id]
    const speed = prev - (r.frames[i - 2]?.[id] ?? 0)
    return i - 1 + Math.min(1, (info.distance - prev) / Math.max(speed, 0.01))
  }
  const t0 = crossAt(r.winnerId)
  return r.order.map((id, i) => ({
    horse: info.horses[id],
    info: i === 0 ? "🏁" : `+${(((crossAt(id) - t0) * r.tickMs) / 1000).toFixed(1)}s`,
  }))
}
const duplaKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`

// Odds for the current picks, or null until the bet type has all the horses it needs.
function oddsFor(race: RaceState | null, type: BetType, picks: Horse[]) {
  if (!race || picks.length !== picksNeeded[type]) return null
  const [a, b, c] = picks.map((p) => p.id)
  if (type === "win") return picks[0].odds
  if (type === "place") return picks[0].placeOdds
  if (type === "dupla") return race.duplaOdds[duplaKey(a, b)]
  if (type === "exata") return race.exataOdds[`${a}>${b}`]
  return race.trifetaOdds[`${a}>${b}>${c}`]
}
const surfaceLabel: Record<string, string> = { grama: "🌿 Grama", areia: "🏖️ Areia", terra: "🟫 Terra" }
const goingLabel: Record<string, string> = { seca: "☀️ Seca", molhada: "🌦️ Molhada", pesada: "🌧️ Pesada" }
const groundBadges = (r: RaceInfo) => [
  ...(r.surface === "terra" && r.going !== "seca" ? ["🟤 Barro"] : [surfaceLabel[r.surface]]),
  goingLabel[r.going],
  ...(r.night ? ["🌙 Noturno"] : []),
]

// Player levels: level n starts at 50·n·(n−1) XP (same formula as the server).
const LEVEL_TITLES = ["Novato", "Palpiteiro", "Apostador", "Turfista", "Conhecedor", "Profissional", "Barão do Turfe", "Lenda do Hipódromo"]
const levelStart = (l: number) => 50 * l * (l - 1)
function levelOf(xp: number) {
  let l = 1
  while (xp >= levelStart(l + 1)) l++
  return l
}
const levelTitle = (l: number) => LEVEL_TITLES[Math.min(l, LEVEL_TITLES.length) - 1]


export default function App() {
  const [race, setRace] = useState<RaceState | null>(null)
  const [picks, setPicks] = useState<Horse[]>([])
  const [betType, setBetType] = useState<BetType>("win")
  const [amount, setAmount] = useState("10")
  const [error, setError] = useState("")
  const [positions, setPositions] = useState<number[] | null>(null)
  const [bet, setBet] = useState<Bet | null>(null)
  const [result, setResult] = useState<BetResult | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [running, setRunning] = useState(false)
  const [calls, setCalls] = useState<string[]>([])
  const [raceClock, setRaceClock] = useState(0) // seconds of race time
  const [speed, setSpeed] = useState(1)
  const [muted, setMutedState] = useState(isMuted())
  const [confetti, setConfetti] = useState(0) // bump to fire a new burst
  const [toasts, setToasts] = useState<string[]>([])
  const [notices, setNotices] = useState<{ id: number; text: string }[]>([]) // short toasts (bonus, missions, level)
  const [music, setMusicState] = useState(isMusicOn())
  const [tip, setTip] = useState<string | null>(null) // Seu Zé's reason for his suggested horse
  const [slowmo, setSlowmo] = useState(false) // photo-finish slow motion is playing
  const raf = useRef(0)
  const speedRef = useRef(1)
  const busy = running || countdown !== null
  const needed = picksNeeded[betType]
  const odds = oddsFor(race, betType, picks)

  const load = () =>
    fetch("/api/race")
      .then((r) => r.json())
      .then(setRace)
      .catch(() => setError("Servidor fora do ar. Rode o backend em Go."))

  useEffect(() => {
    load()
    // Browsers only allow audio after a user gesture: start the lobby music on the first click.
    const unlock = () => setMusicMode("lobby")
    window.addEventListener("pointerdown", unlock, { once: true })
    return () => {
      cancelAnimationFrame(raf.current)
      stopHooves()
      setMusicMode(null)
      window.removeEventListener("pointerdown", unlock)
    }
  }, [])

  function toggleMusic() {
    setMusicOn(!music)
    setMusicState(!music)
  }

  function toggleSpeed() {
    speedRef.current = speedRef.current === 1 ? 2 : 1
    setSpeed(speedRef.current)
  }

  function toggleMute() {
    setMuted(!muted)
    setMutedState(!muted)
  }

  function chooseType(t: BetType) {
    setBetType(t)
    setTip(null)
    setPicks((p) => p.slice(0, picksNeeded[t]))
  }

  function pick(h: Horse) {
    setTip(null)
    if (needed === 1) return setPicks([h])
    // Multi-horse bets: click toggles; picks keep the click order (1st, 2nd, 3rd); an extra pick drops the oldest.
    setPicks((p) => (p.some((x) => x.id === h.id) ? p.filter((x) => x.id !== h.id) : [...p, h].slice(-needed)))
  }

  // Replays the server-decided race frame by frame, with live commentary. Resolves when the race ends.
  function animate(r: BetResult, info: RaceInfo) {
    const { horses, distance } = info
    return new Promise<void>((done) => {
      setPositions(null)
      setCalls([])
      setRunning(true)
      sounds.bell()
      startHooves()
      setMusicMode("race")
      const say = (msg: string) => {
        setCalls([msg])
        speak(msg)
      }
      say(
        info.surface === "terra" && info.going === "pesada"
          ? "Largaram no barro! Vai ser uma corrida dura!"
          : info.going !== "seca"
            ? "Largada debaixo de chuva!"
            : "E foi dada a largada!",
      )
      let leader = -1
      let lastLeaderCall = -Infinity
      let saidHalf = false
      let saidFinal = false
      let t = 0
      let prev = performance.now()
      let slow = false
      const last = r.frames.length - 1
      const tick = (now: number) => {
        // rAF timestamps can be slightly older than performance.now(), so never step backwards.
        // Close finishes play the last metres at quarter speed until the runner-up crosses.
        t = Math.min(t + (Math.max(0, now - prev) / r.tickMs) * speedRef.current * (slow ? 0.25 : 1), last)
        prev = now
        const i = Math.floor(t)
        const a = r.frames[i]
        const b = r.frames[Math.min(i + 1, last)]
        const pos = a.map((p, k) => p + (b[k] - p) * (t - i))
        setPositions(pos)
        setRaceClock((t * r.tickMs) / 1000)
        const [first, second] = [...pos].sort((x, y) => y - x)
        slow = r.gap < 3 && first > distance - 60 && second < distance
        setSlowmo(slow)

        const lead = pos.indexOf(Math.max(...pos))
        // Only call a new leader after 100 m, before anyone finishes (finished horses all sit at the line),
        // and at most every 1.5 s of race time, so it doesn't flicker.
        if (lead !== leader && pos[lead] > 100 && pos[lead] < distance && t - lastLeaderCall > 15) {
          say(`${horses[lead].name} assume a ponta!`)
          lastLeaderCall = t
        }
        leader = lead
        if (!saidHalf && pos[lead] > distance / 2) {
          saidHalf = true
          say(`Metade da prova, ${horses[lead].name} lidera.`)
        }
        if (!saidFinal && pos[lead] > distance - 200) {
          saidFinal = true
          say("Entraram na reta final!")
        }
        if (t < last) {
          raf.current = requestAnimationFrame(tick)
          return
        }
        say(
          r.gap < 3
            ? `PHOTO FINISH! ${horses[r.winnerId].name} vence por ${r.gap.toFixed(1)} m!`
            : `${horses[r.winnerId].name} vence com ${r.gap.toFixed(0)} m de vantagem!`,
        )
        stopHooves()
        sounds.crowd()
        setMusicMode("lobby")
        setSlowmo(false)
        setRunning(false)
        done()
      }
      raf.current = requestAnimationFrame(tick)
    })
  }

  async function placeBet() {
    if (!race || odds === null) return
    const cents = Math.round(Number(amount) * 100)
    setError("")
    const res = await fetch("/api/bet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        raceId: race.raceId,
        horseId: picks[0].id,
        horse2: picks[1]?.id ?? 0,
        horse3: picks[2]?.id ?? 0,
        amount: cents,
        type: betType,
      }),
    }).catch(() => null)
    if (!res) return setError("Servidor fora do ar.")
    const data = await res.json()
    if (!res.ok) return setError(data.error)

    const r = data as BetResult
    const info: RaceInfo = {
      horses: race.horses,
      going: race.going,
      surface: race.surface,
      distance: race.distance,
      night: race.night,
      gp: race.gp,
    }
    setBet({ raceId: race.raceId, picks, amount: cents, odds, type: betType, race: info })
    setPicks([]) // the booth now shows the printed ticket
    setTip(null)
    setResult(null)
    setPositions(null)
    setCalls([])
    setRace({ ...race, balance: race.balance - cents })

    for (let n = 3; n > 0; n--) {
      setCountdown(n)
      sounds.beep()
      await new Promise((ok) => setTimeout(ok, 800))
    }
    setCountdown(null)
    await animate(r, info)

    setResult(r)
    if (r.won) {
      sounds.win()
      setConfetti((c) => c + 1)
    } else sounds.lose()
    if (r.unlocked?.length) {
      setToasts(r.unlocked)
      setTimeout(() => setToasts([]), 5000)
    }
    for (const m of r.missionsDone ?? []) {
      showNotice(`📋 Missão cumprida: ${m}! +${brl(r.missionReward / (r.missionsDone?.length ?? 1))}`)
    }
    if (r.levelUp) {
      showNotice(`⭐ Nível ${r.levelUp}: ${levelTitle(r.levelUp)}! Prêmio de ${brl(r.levelReward)}`)
    }
    if (r.levelUp || r.missionsDone?.length) {
      sounds.coin()
      setConfetti((c) => c + 1)
    }
    load()
  }

  async function reset() {
    setRace(await (await fetch("/api/reset", { method: "POST" })).json())
  }

  // Keyboard shortcuts: 1–6 pick a horse, Enter places the bet. Ignored while typing or racing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy || !race || (e.target as HTMLElement).closest("input, textarea")) return
      const n = Number(e.key)
      if (n >= 1 && n <= race.horses.length) pick(race.horses[n - 1])
      else if (e.key === "Enter" && odds !== null) {
        e.preventDefault() // don't also "click" the focused stall button
        placeBet()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  function showNotice(text: string) {
    const id = Date.now() + Math.random()
    setNotices((n) => [...n, { id, text }])
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 4500)
  }

  async function claimBonus() {
    const res = await fetch("/api/bonus", { method: "POST" }).catch(() => null)
    if (!res) return setError("Servidor fora do ar.")
    const data = await res.json()
    if (!res.ok) return showNotice(data.error)
    setRace(data)
    sounds.coin()
    setConfetti((c) => c + 1)
    showNotice(`🎁 Bônus diário: +${brl(data.bonusAmount)}!`)
  }

  // Seu Zé picks the horse whose strength fits today's race best (odds already price this in; it's flavour).
  function giveTip() {
    if (!race) return
    const fits = (h: Horse) =>
      (h.mudder && race.going !== "seca") || (h.stayer && race.distance >= 1200) || (h.specialist && h.pref === race.surface)
    const best = [...race.horses].sort((x, y) => (fits(y) ? 1.35 : 1) / y.odds - (fits(x) ? 1.35 : 1) / x.odds)[0]
    const odd = best.odds.toFixed(2)
    setBetType("win")
    setPicks([best])
    setTip(
      best.mudder && race.going !== "seca"
        ? `Com essa pista ${race.going}, o ${best.name} que gosta de lama é boa pedida! Paga ${odd}.`
        : best.stayer && race.distance >= 1200
          ? `${race.distance} m é chão! O ${best.name} tem fôlego de sobra. Paga ${odd}.`
          : best.specialist && best.pref === race.surface
            ? `O ${best.name} conhece essa ${race.surface} como ninguém. Paga ${odd}.`
            : `Vai no ${best.name}, tá bem cotado e paga ${odd}.`,
    )
  }

  // While racing (and right after), the track shows the race that ran, not the next race card.
  const shown: RaceInfo | null = (busy || result) && bet ? bet.race : race
  const betIds = (busy || result) && bet ? bet.picks.map((p) => p.id) : []
  const ranking = positions && shown ? [...shown.horses].sort((x, y) => positions[y.id] - positions[x.id]) : null
  const towerTitle = running ? "AO VIVO" : result && !busy ? "RESULTADO" : "GRID · ODDS"
  const towerRows: TowerRow[] = !shown
    ? []
    : running && ranking && positions
      ? ranking.map((h, i) => ({
          horse: h,
          info: i === 0 ? "LÍDER" : `+${(positions[ranking[0].id] - positions[h.id]).toFixed(1)}m`,
        }))
      : result && !busy
        ? finishRows(result, shown)
        : shown.horses.map((h) => ({ horse: h, info: h.odds.toFixed(2) }))
  const stats = race?.stats
  const profit = stats ? stats.returned - stats.staked : 0
  const unlocked = stats?.achievements ?? []

  return (
    <div className="min-h-screen bg-background text-foreground">
      {confetti > 0 && <Confetti key={confetti} />}

      <div className="fixed right-4 bottom-4 z-50 space-y-2" aria-live="polite">
        {notices.map((n) => (
          <div key={n.id} className="animate-in slide-in-from-right fade-in rounded-lg border border-emerald-500/50 bg-card p-3 font-semibold shadow-xl">
            {n.text}
          </div>
        ))}
        {toasts.map((id) => (
          <div key={id} className="animate-in slide-in-from-right fade-in flex items-center gap-3 rounded-lg border border-amber-500/50 bg-card p-3 shadow-xl">
            <span className="text-3xl">{ACHIEVEMENTS[id]?.icon}</span>
            <div>
              <div className="text-xs font-semibold tracking-wide text-amber-400 uppercase">Conquista desbloqueada</div>
              <div className="font-semibold">{ACHIEVEMENTS[id]?.title}</div>
            </div>
          </div>
        ))}
      </div>

      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="size-8" />
            <span className="text-lg font-semibold">Hipódromo Virtual</span>
          </div>
          <div className="flex items-center gap-3">
            {stats && stats.streak >= 2 && <Badge className="bg-orange-600 text-white">🔥 {stats.streak} seguidas</Badge>}
            {stats && <LevelBadge xp={stats.xp ?? 0} />}
            <button onClick={toggleMusic} className="sound-btn" aria-label={music ? "Desligar música" : "Ligar música"} aria-pressed={music}>
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
                <path d="M9 17V6l10-2v11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <circle cx="7" cy="17" r="2.6" fill="currentColor" />
                <circle cx="17" cy="15" r="2.6" fill="currentColor" />
                {!music && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />}
              </svg>
            </button>
            <button onClick={toggleMute} className="sound-btn" aria-label={muted ? "Ligar som" : "Desligar som"} aria-pressed={!muted}>
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
                <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
                {muted ? (
                  <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                ) : (
                  <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                )}
              </svg>
            </button>
            {race?.bonusAvailable && !busy && (
              <button onClick={claimBonus} className="gift-btn" aria-label={`Resgatar bônus diário de ${brl(race.bonusAmount)}`}>
                🎁 <span className="hidden sm:inline">+{brl(race.bonusAmount)}</span>
              </button>
            )}
            {/* balance printed on a (fictional) banknote */}
            <div className="banknote" aria-label={`Saldo: ${race ? brl(race.balance) : "carregando"}`}>
              <span className="banknote-seal" aria-hidden>
                🐎
              </span>
              <span className="banknote-value">{race ? brl(race.balance) : "—"}</span>
            </div>
            {race && race.balance < 100 && !busy && (
              <Button size="sm" variant="outline" onClick={reset}>
                Recarregar
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <section aria-label="Transmissão da corrida">
            <div className={cn("tv rounded-2xl p-3 pb-2 shadow-2xl", shown?.gp && "tv-gp")}>
              <div className="tv-screen relative overflow-hidden rounded-lg bg-black">
                {/* broadcast top bar: channel logo and live clock, kept off the lanes */}
                <div className="flex h-7 items-center justify-between bg-zinc-950 px-3 font-mono text-xs text-white">
                  <span className="font-sans text-[11px] font-black tracking-wider">
                    🐎 HV ESPORTES
                    {shown?.gp && <span className="ml-2 rounded bg-amber-400 px-1.5 text-stone-900">🏆 GRANDE PRÊMIO</span>}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {running ? (
                      <>
                        <span className="size-2 animate-pulse rounded-full bg-red-500" />
                        AO VIVO · {clock(raceClock)}
                      </>
                    ) : result && !busy ? (
                      <>🏁 {clock(raceClock)}</>
                    ) : (
                      <>PÁREO #{race?.raceId ?? "…"}</>
                    )}
                  </span>
                </div>
                {shown && (
                  <div className="relative">
                    <Track
                      horses={shown.horses}
                      positions={positions}
                      running={running}
                      betOn={betIds}
                      going={shown.going}
                      surface={shown.surface}
                      distance={shown.distance}
                      night={shown.night}
                    />
                    {/* F1-style tower overlaid on the picture; hidden before the start so it doesn't cover the gates */}
                    {(running || (result && !busy)) && (
                      <div className="absolute top-3 left-2 z-20">
                        <TimingTower title={towerTitle} rows={towerRows} highlight={betIds} running={running} />
                      </div>
                    )}
                  </div>
                )}
                {countdown !== null && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50">
                    <span key={countdown} className="animate-in zoom-in-50 fade-in text-7xl font-black text-white drop-shadow-lg">
                      {countdown}
                    </span>
                  </div>
                )}
                {slowmo && (
                  <div className="absolute top-12 left-1/2 z-20 -translate-x-1/2 animate-pulse rounded-md bg-black/80 px-3 py-1 font-mono text-sm font-black tracking-widest text-white shadow-lg">
                    🎥 CÂMERA LENTA
                  </div>
                )}
                {result && !running && result.gap < 3 && (
                  <div className="absolute top-12 left-1/2 z-20 -translate-x-1/2 animate-in zoom-in-75 fade-in rounded-md bg-white px-3 py-1 text-sm font-black tracking-widest text-black shadow-lg">
                    📸 PHOTO FINISH
                  </div>
                )}
                {/* lower third: race info before the start, live commentary after */}
                <div className="lower-third flex h-9 items-center gap-2 pr-3 pl-4 text-sm text-white" aria-live="polite">
                  {calls[0] ? (
                    <span className="truncate">🎙️ {calls[0]}</span>
                  ) : (
                    shown && (
                      <>
                        <span className="shrink-0 rounded bg-amber-400 px-1.5 text-xs font-black text-stone-900">
                          {shown.gp ? "🏆 GRANDE PRÊMIO" : `PÁREO #${race?.raceId ?? "…"}`}
                        </span>
                        <span className="truncate">
                          {shown.distance} m · {groundBadges(shown).join(" · ")} ·{" "}
                          {shown.gp
                            ? `${shown.horses.length} cavalos · odds sem margem · XP em dobro`
                            : race?.nextGP
                              ? `Grande Prêmio em ${race.nextGP} páreo${race.nextGP > 1 ? "s" : ""}`
                              : "apostas abertas no guichê"}
                        </span>
                      </>
                    )
                  )}
                </div>
              </div>
              {/* bezel: brand, speed button, power light */}
              <div className="mt-2 flex items-center justify-between px-1">
                <span className="text-[11px] font-black tracking-[0.3em] text-zinc-400">HIPO·TV</span>
                <div className="flex items-center gap-2">
                  <button onClick={toggleSpeed} className="tv-btn" aria-label="Velocidade da animação">
                    {speed}x
                  </button>
                  <span
                    className={cn("size-2 rounded-full", running ? "bg-red-500 shadow-[0_0_6px_#ef4444]" : "bg-emerald-400 shadow-[0_0_6px_#34d399]")}
                    aria-hidden
                  />
                </div>
              </div>
            </div>
            <div className="tv-neck mx-auto h-4 w-24" aria-hidden />
            <div className="tv-base mx-auto h-2.5 w-56 rounded-t-md" aria-hidden />

            {result && bet && !running && <Podium result={result} bet={bet} onReplay={() => animate(result, bet.race)} />}
          </section>

          {race && (
            <Stable
              horses={race.horses}
              surface={race.surface}
              picked={picks.map((p) => p.id)}
              betType={betType}
              gp={race.gp}
              disabled={busy}
              onPick={pick}
            />
          )}
        </div>

        <aside className="space-y-4">
          <BettingBooth
            balance={(race?.balance ?? 0) / 100}
            betType={betType}
            onType={chooseType}
            picks={picks}
            needed={needed}
            odds={odds}
            amount={amount}
            setAmount={setAmount}
            busy={busy}
            error={error}
            onBet={placeBet}
            ticket={
              bet && (busy || result) && picks.length === 0
                ? { ...bet, result: result && !running ? { won: result.won, payout: result.payout } : undefined }
                : null
            }
            tip={tip}
            onTip={giveTip}
          />

          {race?.missions?.length ? <MissionBoard missions={race.missions} /> : null}

          {stats && stats.bets > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Estatísticas</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <Stat label="Apostas" value={String(stats.bets)} />
                <Stat label="Acertos" value={`${Math.round((stats.wins / stats.bets) * 100)}%`} />
                <Stat
                  label="Lucro total"
                  value={`${profit >= 0 ? "+" : ""}${brl(profit)}`}
                  className={profit >= 0 ? "text-emerald-400" : "text-red-400"}
                />
                <Stat label="Maior prêmio" value={brl(stats.bestWin)} />
                <Stat label="Sequência atual" value={`${stats.streak} 🔥`} />
                <Stat label="Melhor sequência" value={String(stats.bestStreak)} />
              </CardContent>
            </Card>
          )}

          <TrophyCase unlocked={unlocked} />
          <HistoryBoard history={stats?.history ?? []} />
        </aside>
      </main>
    </div>
  )
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("font-mono font-semibold", className)}>{value}</div>
    </div>
  )
}

// Level star with title and XP progress toward the next level.
function LevelBadge({ xp }: { xp: number }) {
  const l = levelOf(xp)
  const pct = ((xp - levelStart(l)) / (levelStart(l + 1) - levelStart(l))) * 100
  return (
    <div className="level-badge hidden items-center gap-2 md:flex" title={`${xp} XP · próximo nível em ${levelStart(l + 1) - xp} XP`}>
      <span className="level-star">{l}</span>
      <span className="flex flex-col leading-tight">
        <span className="text-xs font-bold text-amber-200">{levelTitle(l)}</span>
        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-black/50">
          <span className="block h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500 transition-all duration-700" style={{ width: `${pct}%` }} />
        </span>
      </span>
    </div>
  )
}

function Podium({ result, bet, onReplay }: { result: BetResult; bet: Bet; onReplay: () => void }) {
  const horse = (id: number) => bet.race.horses.find((h) => h.id === id)!
  const names = bet.picks.map((p) => p.name).join(isOrdered(bet.type) ? " → " : " + ")
  return (
    <div className={cn("mt-4 rounded-lg border p-4", result.won ? "border-emerald-500 bg-emerald-500/10" : "border-red-500/50 bg-red-500/10")}>
      <p className="mb-3 text-center text-lg font-semibold">
        {result.won ? `Você ganhou ${brl(result.payout)}! 🎉` : `Não foi dessa vez. ${names} (${typeLabel[bet.type]}) perdeu ${brl(bet.amount)}.`}
      </p>
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        {result.order.slice(0, 3).map((id, i) => {
          const h = horse(id)
          return (
            <div key={id} className={cn("rounded-md bg-background/60 p-2", bet.picks.some((p) => p.id === id) && "ring-2 ring-emerald-500")}>
              <div className="text-2xl">{["🥇", "🥈", "🥉"][i]}</div>
              <div className="mt-1 flex items-center justify-center gap-2">
                <Silk color={h.color} n={h.id + 1} />
                <span className="font-medium">{h.name}</span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 text-center">
        <Button size="sm" variant="outline" onClick={onReplay}>
          ▶ Rever corrida
        </Button>
      </div>
    </div>
  )
}

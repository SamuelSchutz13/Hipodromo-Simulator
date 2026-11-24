// Tiny synthesized sound effects (Web Audio), so the project ships no audio files.
let ctx: AudioContext | null = null
let muted = localStorage.getItem("muted") === "1"

export const isMuted = () => muted
export function setMuted(m: boolean) {
  muted = m
  localStorage.setItem("muted", m ? "1" : "0")
  if (m) window.speechSynthesis?.cancel()
}

// Race caller voice via the browser's speech synthesis (Portuguese voice when the system has one).
// Each new call interrupts the previous one so the voice keeps up with the race.
export function speak(text: string) {
  const synth = window.speechSynthesis
  if (muted || !synth) return
  synth.cancel()
  const u = new SpeechSynthesisUtterance(text.replace(/[^\p{L}\p{N}\s.,!?%-]/gu, "")) // drop emoji
  u.lang = "pt-BR"
  u.rate = 1.15
  u.voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith("pt")) ?? null
  synth.speak(u)
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.15) {
  if (muted) return
  ctx ??= new AudioContext()
  const t = ctx.currentTime + start
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(vol, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
  osc.connect(gain).connect(ctx.destination)
  osc.start(t)
  osc.stop(t + dur)
}

// Band-passed white noise: hoof thuds (low, short) and crowd roar (wide, long).
let noiseBuf: AudioBuffer | null = null
function noise(start: number, dur: number, freq: number, q: number, vol: number, attack = 0.005) {
  if (muted) return
  ctx ??= new AudioContext()
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const t = ctx.currentTime + start
  const src = ctx.createBufferSource()
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  src.buffer = noiseBuf
  src.loop = true
  filter.type = "bandpass"
  filter.frequency.value = freq
  filter.Q.value = q
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(vol, t + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(filter).connect(gain).connect(ctx.destination)
  src.start(t)
  src.stop(t + dur + 0.05)
}

// Gallop: a three-beat hoof pattern repeated while the race runs.
let hoofTimer = 0
export function startHooves() {
  stopHooves()
  const gallop = () => [0, 0.075, 0.15].forEach((s, i) => noise(s, 0.07, 160 + i * 35, 1.2, 0.35))
  gallop()
  hoofTimer = window.setInterval(gallop, 400)
}
export const stopHooves = () => window.clearInterval(hoofTimer)

export const sounds = {
  beep: () => tone(660, 0, 0.15, "square", 0.08),
  bell: () => [0, 0.12, 0.24].forEach((s) => tone(1320, s, 0.5, "triangle", 0.2)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.35, "triangle")),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.18, 0.35, "sawtooth", 0.06)),
  crowd: () => noise(0, 2.4, 1000, 0.5, 0.16, 0.35),
  coin: () => [988, 1319].forEach((f, i) => tone(f, i * 0.09, 0.3, "square", 0.07)),
}

export type SoundName = 'start' | 'stop' | 'done' | 'error'

type Note = { freq: number; at: number; duration: number; gain?: number }

const SOUNDS: Record<SoundName, Note[]> = {
  // Rising pair: recording is on.
  start: [
    { freq: 660, at: 0, duration: 0.12 },
    { freq: 880, at: 0.12, duration: 0.18 }
  ],
  // Falling pair: recording is off.
  stop: [
    { freq: 880, at: 0, duration: 0.12 },
    { freq: 550, at: 0.12, duration: 0.2 }
  ],
  // Bright arpeggio: transcript is ready.
  done: [
    { freq: 660, at: 0, duration: 0.1 },
    { freq: 830, at: 0.1, duration: 0.1 },
    { freq: 990, at: 0.2, duration: 0.22 }
  ],
  // Two low blips: something failed.
  error: [
    { freq: 220, at: 0, duration: 0.14, gain: 0.25 },
    { freq: 196, at: 0.18, duration: 0.2, gain: 0.25 }
  ]
}

let context: AudioContext | null = null

// Resolves once the sound has finished. Callers that start capturing audio right afterwards
// await this so the chime itself is not recorded as system audio.
export async function playSound(name: SoundName, enabled = true): Promise<void> {
  if (!enabled) return

  try {
    context ??= new AudioContext()
    if (context.state === 'suspended') await context.resume()

    const ctx = context
    const base = ctx.currentTime + 0.01
    let end = 0

    for (const note of SOUNDS[name]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const peak = note.gain ?? 0.18
      const start = base + note.at
      const stop = start + note.duration

      osc.type = 'sine'
      osc.frequency.value = note.freq
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, stop)

      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(stop + 0.02)
      end = Math.max(end, note.at + note.duration)
    }

    await new Promise((resolve) => setTimeout(resolve, end * 1000 + 80))
  } catch {
    // A missing audio device must never get in the way of recording.
  }
}

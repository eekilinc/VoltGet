// Modern Web Audio chime for download completion
let audioCtx: AudioContext | null = null

export function playDownloadCompleteChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return

    if (!audioCtx) {
      audioCtx = new AudioContextClass()
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume()
    }

    const now = audioCtx.currentTime

    // Master Gain
    const masterGain = audioCtx.createGain()
    masterGain.gain.setValueAtTime(0.12, now)
    masterGain.connect(audioCtx.destination)

    // Note 1: 587.33 Hz (D5) - Soft introductory chime
    const osc1 = audioCtx.createOscillator()
    const gain1 = audioCtx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(587.33, now)

    gain1.gain.setValueAtTime(0.001, now)
    gain1.gain.linearRampToValueAtTime(0.12, now + 0.02)
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12)

    osc1.connect(gain1)
    gain1.connect(masterGain)
    osc1.start(now)
    osc1.stop(now + 0.13)

    // Note 2: 880 Hz (A5) - Bright, uplifting resolution chime
    const osc2 = audioCtx.createOscillator()
    const gain2 = audioCtx.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(880, now + 0.08)

    gain2.gain.setValueAtTime(0.001, now + 0.08)
    gain2.gain.linearRampToValueAtTime(0.15, now + 0.1)
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)

    osc2.connect(gain2)
    gain2.connect(masterGain)
    osc2.start(now + 0.08)
    osc2.stop(now + 0.36)
  } catch (err) {
    console.debug('[VoltGet Audio] Audio playback error:', err)
  }
}

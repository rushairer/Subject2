/**
 * Procedural Web Audio synthesis for vehicle sound effects:
 * - Turn indicator / hazard flasher mechanical relay clicks ("哒-嗒")
 * - Oncoming traffic Doppler whoosh / air displacement ("呼——咻")
 * - Material-specific collision thuds, crunches and resonances
 *
 * All sounds are synthesized purely in software via Web Audio API nodes with
 * zero external audio file dependencies.
 */

import type { CollisionKind } from '../sim/collisionResponse'

export interface VehicleAudioState {
  relayTimer: number
  relayPhaseOn: boolean
  lastWhooshTime: number
  lastCollisionTime: number
  lastConeImpactTime: number
}

export function createVehicleAudioState(): VehicleAudioState {
  return {
    relayTimer: 0,
    relayPhaseOn: false,
    lastWhooshTime: -999,
    lastCollisionTime: -999,
    lastConeImpactTime: -999,
  }
}

/**
 * Synthesizes a mechanical relay click:
 * - isTick = true: high-frequency "哒" on lamp power ON (~1450Hz)
 * - isTick = false: lower-frequency "嗒" on lamp power OFF (~980Hz)
 */
export function playRelayClick(ctx: AudioContext | null, isTick: boolean) {
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()

  const now = ctx.currentTime
  const freq = isTick ? 1450 : 980
  const duration = 0.016

  const osc = ctx.createOscillator()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(freq, now)
  osc.frequency.exponentialRampToValueAtTime(freq * 0.45, now + duration)

  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(freq, now)
  filter.Q.setValueAtTime(3.2, now)

  const gain = ctx.createGain()
  const peakGain = isTick ? 0.055 : 0.04
  gain.gain.setValueAtTime(peakGain, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

  osc.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)
  osc.stop(now + duration + 0.005)
}

/**
 * Updates flasher relay clicks for active turn indicators or hazard lights.
 * Standard flasher cycle is ~80 beats per minute (~0.72s period: 0.36s ON, 0.36s OFF).
 */
export function updateTurnIndicatorAudio(
  state: VehicleAudioState,
  ctx: AudioContext | null,
  active: boolean,
  dt: number,
) {
  if (!active) {
    if (state.relayPhaseOn) {
      state.relayPhaseOn = false
      playRelayClick(ctx, false)
    }
    state.relayTimer = 0
    return
  }

  const HALF_CYCLE = 0.36
  const FULL_CYCLE = HALF_CYCLE * 2

  const prevTimer = state.relayTimer
  const newTimer = (prevTimer + dt) % FULL_CYCLE
  state.relayTimer = newTimer

  // Initial activation
  if (!state.relayPhaseOn && prevTimer === 0) {
    state.relayPhaseOn = true
    playRelayClick(ctx, true)
  }

  // Transition from ON phase to OFF phase
  if (state.relayPhaseOn && prevTimer < HALF_CYCLE && newTimer >= HALF_CYCLE) {
    state.relayPhaseOn = false
    playRelayClick(ctx, false)
  }

  // Transition from OFF phase to ON phase (wrapped around)
  if (!state.relayPhaseOn && prevTimer >= HALF_CYCLE && newTimer < HALF_CYCLE) {
    state.relayPhaseOn = true
    playRelayClick(ctx, true)
  }
}

/**
 * Synthesizes oncoming vehicle air turbulence whoosh with Doppler pitch sweep:
 * Panned to the driver's left side (since oncoming traffic passes on the left in China).
 */
export function playMeetingWhoosh(
  ctx: AudioContext | null,
  relativeSpeedMps: number,
  state?: VehicleAudioState,
) {
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()

  const now = ctx.currentTime
  if (state && now - state.lastWhooshTime < 1.6) {
    return // Avoid duplicate overlapping triggers for the same pass
  }
  if (state) state.lastWhooshTime = now

  const duration = Math.max(0.6, Math.min(1.4, 22 / Math.max(12, relativeSpeedMps)))
  const bufferSize = Math.floor(ctx.sampleRate * duration)
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const channelData = buffer.getChannelData(0)

  // Generate pink/white noise stream
  let lastOut = 0.0
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1
    lastOut = (lastOut + 0.025 * white) / 1.025
    channelData[i] = lastOut * 3.5
  }

  const noise = ctx.createBufferSource()
  noise.buffer = buffer

  // Dynamic bandpass filter with Doppler frequency drop (850Hz -> 240Hz)
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.setValueAtTime(2.2, now)
  filter.frequency.setValueAtTime(780, now)
  filter.frequency.exponentialRampToValueAtTime(240, now + duration)

  // Stereo panner (panned left towards oncoming carriageway)
  const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null
  if (panner) {
    panner.pan.setValueAtTime(-0.75, now)
    panner.pan.linearRampToValueAtTime(-0.4, now + duration)
  }

  // Bell-shaped volume envelope: swells up as cars meet, fades rapidly as cars part
  const gain = ctx.createGain()
  const peakVolume = Math.min(0.22, 0.08 + (relativeSpeedMps / 30) * 0.12)
  gain.gain.setValueAtTime(0.001, now)
  gain.gain.exponentialRampToValueAtTime(peakVolume, now + duration * 0.42)
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration)

  noise.connect(filter)
  if (panner) {
    filter.connect(panner)
    panner.connect(gain)
  } else {
    filter.connect(gain)
  }
  gain.connect(ctx.destination)

  noise.start(now)
}

interface CollisionTone {
  readonly waveform: OscillatorType
  readonly startHz: number
  readonly endHz: number
  readonly duration: number
  readonly gain: number
}

export interface CollisionAudioProfile {
  readonly thump: CollisionTone
  readonly noise: {
    readonly filter: BiquadFilterType
    readonly frequency: number
    readonly q: number
    readonly duration: number
    readonly gain: number
    readonly clatter?: boolean
  }
  readonly ring?: CollisionTone
}

/** Sound design only: these values never determine collision physics or scoring. */
export const COLLISION_AUDIO_PROFILES: Readonly<Record<CollisionKind, CollisionAudioProfile>> = {
  pedestrian: {
    thump: { waveform: 'sine', startHz: 82, endHz: 36, duration: 0.15, gain: 0.13 },
    noise: { filter: 'lowpass', frequency: 220, q: 0.6, duration: 0.08, gain: 0.055 },
  },
  vehicle: {
    thump: { waveform: 'sine', startHz: 110, endHz: 32, duration: 0.32, gain: 0.25 },
    noise: { filter: 'highpass', frequency: 600, q: 0.7, duration: 0.18, gain: 0.18 },
  },
  scooter: {
    thump: { waveform: 'triangle', startHz: 230, endHz: 75, duration: 0.14, gain: 0.12 },
    noise: { filter: 'bandpass', frequency: 1650, q: 1.4, duration: 0.22, gain: 0.11, clatter: true },
  },
  pole: {
    thump: { waveform: 'sine', startHz: 145, endHz: 40, duration: 0.16, gain: 0.23 },
    noise: { filter: 'highpass', frequency: 2000, q: 0.7, duration: 0.07, gain: 0.11 },
    ring: { waveform: 'sine', startHz: 830, endHz: 800, duration: 0.55, gain: 0.12 },
  },
  tree: {
    thump: { waveform: 'triangle', startHz: 150, endHz: 58, duration: 0.17, gain: 0.22 },
    noise: { filter: 'lowpass', frequency: 950, q: 0.7, duration: 0.11, gain: 0.07 },
  },
  building: {
    thump: { waveform: 'sine', startHz: 95, endHz: 26, duration: 0.2, gain: 0.29 },
    noise: { filter: 'lowpass', frequency: 1400, q: 0.7, duration: 0.12, gain: 0.17 },
  },
  cone: {
    thump: { waveform: 'triangle', startHz: 360, endHz: 160, duration: 0.14, gain: 0.18 },
    noise: { filter: 'bandpass', frequency: 850, q: 2.4, duration: 0.2, gain: 0.08, clatter: true },
  },
}

/** Stationary contact is silent; finite impact speed scales continuously to a safe maximum. */
export function collisionAudioIntensity(impactSpeedMps: number): number {
  if (!Number.isFinite(impactSpeedMps)) return 0
  return Math.min(1, Math.max(0, (Math.abs(impactSpeedMps) - 0.1) / 7.9))
}

// Reuse one short source buffer per context. Repeated contacts must not allocate
// and fill thousands of noise samples every rendered frame.
const collisionNoiseBuffers = new WeakMap<AudioContext, AudioBuffer>()

function collisionNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const cached = collisionNoiseBuffers.get(ctx)
  if (cached) return cached
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.25), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  collisionNoiseBuffers.set(ctx, buffer)
  return buffer
}

function playCollisionTone(ctx: AudioContext, now: number, intensity: number, tone: CollisionTone) {
  const osc = ctx.createOscillator()
  osc.type = tone.waveform
  osc.frequency.setValueAtTime(tone.startHz, now)
  osc.frequency.exponentialRampToValueAtTime(tone.endHz, now + tone.duration)

  const gain = ctx.createGain()
  const peak = tone.gain * intensity
  gain.gain.setValueAtTime(peak, now)
  gain.gain.exponentialRampToValueAtTime(peak * 0.002, now + tone.duration)

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.onended = () => {
    osc.disconnect()
    gain.disconnect()
  }
  osc.start(now)
  osc.stop(now + tone.duration + 0.005)
}

/**
 * Soft pedestrian thuds, vehicle crunches, scooter clatter, metal pole ringing,
 * woody tree impacts, hard building thuds and hollow plastic cone knocks share
 * bounded speed-based volume.
 */
export function playCollisionImpact(
  ctx: AudioContext | null,
  impactSpeedMps: number,
  state?: VehicleAudioState,
  kind: CollisionKind = 'vehicle',
) {
  const intensity = collisionAudioIntensity(impactSpeedMps)
  if (!ctx || intensity === 0) return

  const now = ctx.currentTime
  if (state && now - state.lastCollisionTime < 0.8) return
  if (state) state.lastCollisionTime = now
  if (ctx.state === 'suspended') void ctx.resume()

  const profile = COLLISION_AUDIO_PROFILES[kind]
  playCollisionTone(ctx, now, intensity, profile.thump)
  if (profile.ring) playCollisionTone(ctx, now, intensity, profile.ring)

  const source = ctx.createBufferSource()
  source.buffer = collisionNoiseBuffer(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = profile.noise.filter
  filter.frequency.setValueAtTime(profile.noise.frequency, now)
  filter.Q.setValueAtTime(profile.noise.q, now)

  const gain = ctx.createGain()
  const peak = profile.noise.gain * intensity
  gain.gain.setValueAtTime(peak, now)
  if (profile.noise.clatter) {
    // Quieter bounces distinguish a light frame or hollow cone from a single crunch.
    gain.gain.exponentialRampToValueAtTime(peak * 0.04, now + 0.045)
    gain.gain.setValueAtTime(peak * 0.48, now + 0.06)
    gain.gain.exponentialRampToValueAtTime(peak * 0.015, now + 0.098)
    gain.gain.setValueAtTime(peak * 0.22, now + 0.115)
  }
  gain.gain.exponentialRampToValueAtTime(peak * 0.002, now + profile.noise.duration)

  source.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  source.onended = () => {
    source.disconnect()
    filter.disconnect()
    gain.disconnect()
  }
  source.start(now)
  source.stop(now + profile.noise.duration)
}

/**
 * Synthesizes a hollow plastic traffic cone impact and asphalt ground rattle.
 */
export function playConeImpact(
  ctx: AudioContext | null,
  impactSpeedMps: number,
  state?: VehicleAudioState,
) {
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()

  const now = ctx.currentTime
  if (state && now - state.lastConeImpactTime < 0.25) {
    return // Debounce rapid consecutive frames
  }
  if (state) state.lastConeImpactTime = now

  const intensity = Math.min(1.0, Math.max(0.25, Math.abs(impactSpeedMps) / 3.5))

  // 1. Resonant hollow plastic thump (bandpass filtered triangle wave ~360Hz -> ~180Hz)
  const osc = ctx.createOscillator()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(360, now)
  osc.frequency.exponentialRampToValueAtTime(160, now + 0.12)

  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(340, now)
  filter.Q.setValueAtTime(3.2, now)

  const oscGain = ctx.createGain()
  oscGain.gain.setValueAtTime(0.35 * intensity, now)
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14)

  osc.connect(filter)
  filter.connect(oscGain)
  oscGain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.15)

  // 2. Plastic clatter / pavement scrape noise (bandpass 800 - 2400Hz with double-tap decay)
  const noiseDuration = 0.22
  const noiseSize = Math.floor(ctx.sampleRate * noiseDuration)
  const noiseBuffer = ctx.createBuffer(1, noiseSize, ctx.sampleRate)
  const noiseData = noiseBuffer.getChannelData(0)
  for (let i = 0; i < noiseSize; i++) {
    const t = i / ctx.sampleRate
    // Envelope has primary hit at t=0 and secondary ground bounce at t=0.06s
    const env1 = Math.exp(-t / 0.04)
    const env2 = t > 0.06 ? Math.exp(-(t - 0.06) / 0.035) * 0.7 : 0
    noiseData[i] = (Math.random() * 2 - 1) * (env1 + env2)
  }

  const noiseSource = ctx.createBufferSource()
  noiseSource.buffer = noiseBuffer

  const noiseFilter = ctx.createBiquadFilter()
  noiseFilter.type = 'bandpass'
  noiseFilter.frequency.setValueAtTime(1400, now)
  noiseFilter.Q.setValueAtTime(1.8, now)

  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0.24 * intensity, now)
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + noiseDuration)

  noiseSource.connect(noiseFilter)
  noiseFilter.connect(noiseGain)
  noiseGain.connect(ctx.destination)

  noiseSource.start(now)
}

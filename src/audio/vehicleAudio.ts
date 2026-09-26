/**
 * Procedural Web Audio synthesis for vehicle sound effects:
 * - Turn indicator / hazard flasher mechanical relay clicks ("哒-嗒")
 * - Oncoming traffic Doppler whoosh / air displacement ("呼——咻")
 * - Collision impact thud / metal crunch
 *
 * All sounds are synthesized purely in software via Web Audio API nodes with
 * zero external audio file dependencies.
 */

export interface VehicleAudioState {
  relayTimer: number
  relayPhaseOn: boolean
  lastWhooshTime: number
  lastCollisionTime: number
}

export function createVehicleAudioState(): VehicleAudioState {
  return {
    relayTimer: 0,
    relayPhaseOn: false,
    lastWhooshTime: -999,
    lastCollisionTime: -999,
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

/**
 * Synthesizes heavy metal collision thud and impact crunch.
 */
export function playCollisionImpact(
  ctx: AudioContext | null,
  impactSpeedMps: number,
  state?: VehicleAudioState,
) {
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()

  const now = ctx.currentTime
  if (state && now - state.lastCollisionTime < 0.8) {
    return // Debounce rapid consecutive frames
  }
  if (state) state.lastCollisionTime = now

  const intensity = Math.min(1.0, Math.max(0.3, Math.abs(impactSpeedMps) / 8.0))

  // 1. Low-frequency impact thump (120Hz -> 30Hz)
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(110, now)
  osc.frequency.exponentialRampToValueAtTime(32, now + 0.28)

  const oscGain = ctx.createGain()
  oscGain.gain.setValueAtTime(0.25 * intensity, now)
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32)

  osc.connect(oscGain)
  oscGain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.35)

  // 2. High-frequency metal crunch noise
  const noiseDuration = 0.18
  const noiseSize = Math.floor(ctx.sampleRate * noiseDuration)
  const noiseBuffer = ctx.createBuffer(1, noiseSize, ctx.sampleRate)
  const noiseData = noiseBuffer.getChannelData(0)
  for (let i = 0; i < noiseSize; i++) {
    noiseData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (noiseSize * 0.3))
  }

  const noiseSource = ctx.createBufferSource()
  noiseSource.buffer = noiseBuffer

  const noiseFilter = ctx.createBiquadFilter()
  noiseFilter.type = 'highpass'
  noiseFilter.frequency.setValueAtTime(600, now)

  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0.18 * intensity, now)
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + noiseDuration)

  noiseSource.connect(noiseFilter)
  noiseFilter.connect(noiseGain)
  noiseGain.connect(ctx.destination)

  noiseSource.start(now)
}

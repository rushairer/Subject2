import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createVehicleAudioState,
  updateTurnIndicatorAudio,
  playRelayClick,
  playMeetingWhoosh,
  playCollisionImpact,
  playConeImpact,
  COLLISION_AUDIO_PROFILES,
  collisionAudioIntensity,
} from '../src/audio/vehicleAudio'

function mockCollisionAudio() {
  type ParamEvent = { type: 'set' | 'ramp'; value: number; time: number }
  const param = () => {
    const events: ParamEvent[] = []
    return {
      events,
      setValueAtTime(value: number, time: number) { events.push({ type: 'set', value, time }) },
      exponentialRampToValueAtTime(value: number, time: number) { events.push({ type: 'ramp', value, time }) },
    }
  }
  const node = () => ({
    disconnected: false,
    connect: () => {},
    disconnect() { this.disconnected = true },
  })
  const scheduledNode = () => ({
    ...node(),
    startedAt: undefined as number | undefined,
    stoppedAt: undefined as number | undefined,
    onended: null as null | (() => void),
    start(time: number) { this.startedAt = time },
    stop(time: number) { this.stoppedAt = time },
  })
  const oscillators: Array<ReturnType<typeof scheduledNode> & { type: string; frequency: ReturnType<typeof param> }> = []
  const sources: Array<ReturnType<typeof scheduledNode> & { buffer: AudioBuffer | null }> = []
  const filters: Array<ReturnType<typeof node> & { type: string; frequency: ReturnType<typeof param>; Q: ReturnType<typeof param> }> = []
  const gains: Array<ReturnType<typeof node> & { gain: ReturnType<typeof param> }> = []
  const context = {
    currentTime: 10,
    state: 'running',
    sampleRate: 44100,
    destination: {},
    buffersCreated: 0,
    resumes: 0,
    resume() { this.resumes += 1; return Promise.resolve() },
    createOscillator() {
      const oscillator = { ...scheduledNode(), type: 'sine', frequency: param() }
      oscillators.push(oscillator)
      return oscillator
    },
    createGain() {
      const gain = { ...node(), gain: param() }
      gains.push(gain)
      return gain
    },
    createBiquadFilter() {
      const filter = { ...node(), type: 'lowpass', frequency: param(), Q: param() }
      filters.push(filter)
      return filter
    },
    createBuffer(_channels: number, length: number) {
      this.buffersCreated += 1
      const samples = new Float32Array(length)
      return { getChannelData: () => samples }
    },
    createBufferSource() {
      const source = { ...scheduledNode(), buffer: null as AudioBuffer | null }
      sources.push(source)
      return source
    },
  }
  return { context, ctx: context as unknown as AudioContext, oscillators, sources, filters, gains }
}

test('vehicle audio state initializes correctly', () => {
  const state = createVehicleAudioState()
  assert.equal(state.relayTimer, 0)
  assert.equal(state.relayPhaseOn, false)
  assert.equal(state.lastWhooshTime, -999)
  assert.equal(state.lastCollisionTime, -999)
  assert.equal(state.lastConeImpactTime, -999)
})

test('turn indicator audio cycles between tick and tock at flasher frequency', () => {
  const state = createVehicleAudioState()
  const events: string[] = []

  // Mock AudioContext with destination
  const mockCtx = {
    currentTime: 0,
    state: 'running',
    sampleRate: 44100,
    destination: {},
    createOscillator: () => ({
      type: 'triangle',
      frequency: {
        setValueAtTime: (freq: number) => {
          events.push(freq > 1200 ? 'tick' : 'tock')
        },
        exponentialRampToValueAtTime: () => {},
      },
      connect: () => {},
      start: () => {},
      stop: () => {},
    }),
    createBiquadFilter: () => ({
      type: 'bandpass',
      frequency: { setValueAtTime: () => {} },
      Q: { setValueAtTime: () => {} },
      connect: () => {},
    }),
    createGain: () => ({
      gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      connect: () => {},
    }),
  } as unknown as AudioContext

  // 1. Initial turn on -> triggers "tick"
  updateTurnIndicatorAudio(state, mockCtx, true, 0.05)
  assert.equal(state.relayPhaseOn, true)
  assert.deepEqual(events, ['tick'])

  // 2. Step 0.35s forward -> reaches half-cycle -> triggers "tock"
  updateTurnIndicatorAudio(state, mockCtx, true, 0.35)
  assert.equal(state.relayPhaseOn, false)
  assert.deepEqual(events, ['tick', 'tock'])

  // 3. Step another 0.36s forward -> next cycle -> triggers "tick"
  updateTurnIndicatorAudio(state, mockCtx, true, 0.36)
  assert.equal(state.relayPhaseOn, true)
  assert.deepEqual(events, ['tick', 'tock', 'tick'])

  // 4. Turn off -> plays closing "tock" and resets
  updateTurnIndicatorAudio(state, mockCtx, false, 0.05)
  assert.equal(state.relayPhaseOn, false)
  assert.equal(state.relayTimer, 0)
  assert.deepEqual(events, ['tick', 'tock', 'tick', 'tock'])
})

test('null audio context does not crash any audio function', () => {
  assert.doesNotThrow(() => {
    playRelayClick(null, true)
    playMeetingWhoosh(null, 20)
    playCollisionImpact(null, 10)
    playConeImpact(null, 5)
  })
})

test('collision materials have distinct sound profiles and bounded volume', () => {
  const profiles = Object.values(COLLISION_AUDIO_PROFILES)
  assert.equal(new Set(profiles.map(profile => JSON.stringify(profile))).size, 7)
  assert.deepEqual(Object.keys(COLLISION_AUDIO_PROFILES).sort(), ['building', 'cone', 'pedestrian', 'pole', 'scooter', 'tree', 'vehicle'])
  for (const profile of profiles) {
    const maximumPeak = profile.thump.gain + profile.noise.gain + (profile.ring?.gain ?? 0)
    assert.ok(maximumPeak > 0 && maximumPeak <= 0.5)
  }
  assert.equal(COLLISION_AUDIO_PROFILES.pedestrian.noise.filter, 'lowpass')
  assert.ok(COLLISION_AUDIO_PROFILES.pedestrian.noise.frequency < 300)
  assert.equal(COLLISION_AUDIO_PROFILES.vehicle.noise.filter, 'highpass')
  assert.equal(COLLISION_AUDIO_PROFILES.scooter.noise.clatter, true)
  assert.ok(COLLISION_AUDIO_PROFILES.scooter.thump.gain < COLLISION_AUDIO_PROFILES.vehicle.thump.gain)
  assert.ok(COLLISION_AUDIO_PROFILES.pole.ring!.duration > 0.5)
  assert.equal(COLLISION_AUDIO_PROFILES.tree.noise.filter, 'lowpass')
  assert.equal(COLLISION_AUDIO_PROFILES.tree.ring, undefined)
  assert.ok(COLLISION_AUDIO_PROFILES.building.thump.gain > COLLISION_AUDIO_PROFILES.pedestrian.thump.gain)
  assert.equal(COLLISION_AUDIO_PROFILES.cone.thump.waveform, 'triangle')
  assert.equal(COLLISION_AUDIO_PROFILES.cone.noise.filter, 'bandpass')
  assert.ok(COLLISION_AUDIO_PROFILES.cone.noise.frequency < 1000)
  assert.ok(COLLISION_AUDIO_PROFILES.cone.noise.q > 2)
  assert.equal(COLLISION_AUDIO_PROFILES.cone.noise.clatter, true)
  assert.equal(COLLISION_AUDIO_PROFILES.cone.ring, undefined)
})

test('collision intensity is silent for invalid or near-zero speed and scales in both directions', () => {
  for (const speed of [0, 0.01, -0.01, 0.1, -0.1, NaN, Infinity, -Infinity]) {
    assert.equal(collisionAudioIntensity(speed), 0)
  }
  const speeds = [0.11, 0.2, 1, 3, 8, 30, Number.MAX_VALUE]
  let previousIntensity = 0
  for (const speed of speeds) {
    const intensity = collisionAudioIntensity(speed)
    assert.ok(intensity > 0 && intensity <= 1)
    assert.ok(intensity >= previousIntensity)
    assert.equal(collisionAudioIntensity(-speed), intensity)
    previousIntensity = intensity
  }
  assert.ok(collisionAudioIntensity(0.2) < 0.02)
  assert.equal(collisionAudioIntensity(8), 1)
})

test('collision synthesis applies each material profile and stops and disconnects every source', () => {
  for (const kind of Object.keys(COLLISION_AUDIO_PROFILES) as Array<keyof typeof COLLISION_AUDIO_PROFILES>) {
    const audio = mockCollisionAudio()
    const profile = COLLISION_AUDIO_PROFILES[kind]
    playCollisionImpact(audio.ctx, 8, undefined, kind)
    assert.equal(audio.oscillators.length, profile.ring ? 2 : 1, kind)
    assert.equal(audio.oscillators[0].type, profile.thump.waveform, kind)
    assert.equal(audio.oscillators[0].frequency.events[0].value, profile.thump.startHz, kind)
    assert.equal(audio.oscillators[0].frequency.events[1].value, profile.thump.endHz, kind)
    assert.equal(audio.filters[0].type, profile.noise.filter, kind)
    assert.equal(audio.filters[0].frequency.events[0].value, profile.noise.frequency, kind)
    assert.equal(audio.filters[0].Q.events[0].value, profile.noise.q, kind)
    assert.equal(audio.gains[0].gain.events[0].value, profile.thump.gain, kind)
    const noiseGain = audio.gains[audio.gains.length - 1]
    assert.equal(noiseGain.gain.events[0].value, profile.noise.gain, kind)
    assert.equal(noiseGain.gain.events.filter(event => event.type === 'set').length, profile.noise.clatter ? 3 : 1, kind)
    assert.equal(audio.sources[0].stoppedAt, audio.context.currentTime + profile.noise.duration, kind)
    for (const source of [...audio.oscillators, ...audio.sources]) {
      assert.equal(source.startedAt, audio.context.currentTime, kind)
      assert.ok(source.stoppedAt! > source.startedAt! && source.stoppedAt! <= audio.context.currentTime + 0.6, kind)
      source.onended!()
      assert.equal(source.disconnected, true, kind)
    }
    assert.ok(audio.gains.every(gain => gain.disconnected), kind)
    assert.ok(audio.filters.every(filter => filter.disconnected), kind)
  }
})

test('legacy collision call defaults to a vehicle body crunch', () => {
  const audio = mockCollisionAudio()
  playCollisionImpact(audio.ctx, 8)
  assert.equal(audio.oscillators[0].frequency.events[0].value, COLLISION_AUDIO_PROFILES.vehicle.thump.startHz)
  assert.equal(audio.filters[0].type, 'highpass')
})

test('silent collision contact allocates no audio and does not suppress the next real impact', () => {
  const audio = mockCollisionAudio()
  const state = createVehicleAudioState()
  audio.context.state = 'suspended'
  for (const speed of [0, -0.01, 0.1, NaN, Infinity]) playCollisionImpact(audio.ctx, speed, state, 'pole')
  assert.equal(audio.oscillators.length, 0)
  assert.equal(audio.context.buffersCreated, 0)
  assert.equal(audio.context.resumes, 0)
  assert.equal(state.lastCollisionTime, -999)
  playCollisionImpact(audio.ctx, 1, state, 'pole')
  assert.equal(audio.oscillators.length, 2)
  assert.equal(audio.context.resumes, 1)
  assert.equal(state.lastCollisionTime, audio.context.currentTime)
})

test('collision debounce blocks sustained contact audio and reuses the short noise buffer', () => {
  const audio = mockCollisionAudio()
  const state = createVehicleAudioState()
  playCollisionImpact(audio.ctx, 3, state)
  assert.equal(audio.sources.length, 1)
  assert.equal(state.lastCollisionTime, 10)
  audio.context.currentTime = 10.5
  playCollisionImpact(audio.ctx, 3, state)
  assert.equal(audio.sources.length, 1)
  audio.context.currentTime = 10.81
  playCollisionImpact(audio.ctx, 3, state, 'tree')
  assert.equal(audio.sources.length, 2)
  assert.equal(audio.context.buffersCreated, 1)
  assert.equal(audio.sources[0].buffer, audio.sources[1].buffer)
  assert.equal(state.lastCollisionTime, 10.81)
})

test('playConeImpact debounces rapid consecutive collisions', () => {
  const state = createVehicleAudioState()
  let played = 0
  const mockCtx = {
    currentTime: 10.0,
    state: 'running',
    sampleRate: 44100,
    destination: {},
    createOscillator: () => {
      played += 1
      return {
        type: 'triangle',
        frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        connect: () => {},
        start: () => {},
        stop: () => {},
      }
    },
    createBiquadFilter: () => ({
      type: 'bandpass',
      frequency: { setValueAtTime: () => {} },
      Q: { setValueAtTime: () => {} },
      connect: () => {},
    }),
    createGain: () => ({
      gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      connect: () => {},
    }),
    createBuffer: () => ({
      getChannelData: () => new Float32Array(100),
    }),
    createBufferSource: () => ({
      buffer: null,
      connect: () => {},
      start: () => {},
    }),
  } as unknown as AudioContext

  // First hit plays
  playConeImpact(mockCtx, 3.0, state)
  assert.equal(played, 1)
  assert.equal(state.lastConeImpactTime, 10.0)

  // Hit 0.1s later (within 0.25s debounce window) is skipped
  mockCtx.currentTime = 10.1
  playConeImpact(mockCtx, 3.0, state)
  assert.equal(played, 1)

  // Hit 0.3s later (after 0.25s debounce window) plays
  mockCtx.currentTime = 10.35
  playConeImpact(mockCtx, 3.0, state)
  assert.equal(played, 2)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createVehicleAudioState,
  updateTurnIndicatorAudio,
  playRelayClick,
  playMeetingWhoosh,
  playCollisionImpact,
  playConeImpact,
} from '../src/audio/vehicleAudio'

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

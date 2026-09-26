import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createVehicleAudioState,
  updateTurnIndicatorAudio,
  playRelayClick,
  playMeetingWhoosh,
  playCollisionImpact,
} from '../src/audio/vehicleAudio'

test('vehicle audio state initializes correctly', () => {
  const state = createVehicleAudioState()
  assert.equal(state.relayTimer, 0)
  assert.equal(state.relayPhaseOn, false)
  assert.equal(state.lastWhooshTime, -999)
  assert.equal(state.lastCollisionTime, -999)
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
  })
})

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearDrivingKeys, drivingKey, drivingLook, fixedThrottleFromDrivingKeys, pressDrivingKey, releaseDrivingKey,
  type DrivingKeys,
} from '../src/input/drivingKeyboard.ts'

test('physical keys survive Shift and different key labels', () => {
  assert.equal(drivingKey({ code: 'KeyW', key: 'W' }), 'w')
  assert.equal(drivingKey({ code: 'Digit1', key: '!' }), '1')
  assert.equal(drivingKey({ code: 'Digit9', key: '(' }), '9')
  assert.equal(drivingKey({ code: 'Numpad7', key: '7' }), '7')
  assert.equal(drivingKey({ code: 'ShiftRight', key: 'Shift' }), 'shift')
  assert.equal(drivingKey({ code: 'Space', key: ' ' }), 'space')
  assert.equal(drivingKey({ code: 'ArrowLeft', key: 'ArrowLeft' }), 'arrowleft')
})

test('fallback keys are normalized and unrelated keys are ignored', () => {
  assert.equal(drivingKey({ key: 'W' }), 'w')
  assert.equal(drivingKey({ key: 'Spacebar' }), 'space')
  assert.equal(drivingKey({ key: 'Escape' }), null)
})

test('holding a toggle does not repeatedly toggle engine, belt, brake or lights', () => {
  for (const key of ['space', 'i', 't', 'q', 'e', 'v', 'l', 'k', 'm'] as const) {
    const keys: DrivingKeys = {}
    assert.equal(pressDrivingKey(keys, key), true)
    assert.equal(pressDrivingKey(keys, key, true), false)
    assert.equal(pressDrivingKey(keys, key), false)
    assert.equal(keys[key], true)
    releaseDrivingKey(keys, key)
    assert.equal(pressDrivingKey(keys, key), true)
  }
})

test('a repeat without an initial keydown restores held input but never triggers a toggle', () => {
  const keys: DrivingKeys = {}
  assert.equal(pressDrivingKey(keys, 'w', true), false)
  assert.equal(keys.w, true)
})

test('key release remains valid after releasing Shift before the driving key', () => {
  const keys: DrivingKeys = {}
  const down = drivingKey({ code: 'KeyW', key: 'W' })!
  const up = drivingKey({ code: 'KeyW', key: 'w' })!
  pressDrivingKey(keys, down)
  releaseDrivingKey(keys, up)
  assert.equal(keys.w, undefined)
})

test('focus loss clears every held control and look direction', () => {
  const keys: DrivingKeys = { w: true, c: true, shift: true, z: true, f: true, b: true }
  clearDrivingKeys(keys)
  assert.deepEqual(keys, {})
  assert.deepEqual(drivingLook(keys), { lookLeft: false, lookRight: false, lookBack: false, yaw: 0 })
})

test('releasing rear observation restores another direction still held', () => {
  const keys: DrivingKeys = { z: true, f: true }
  assert.equal(drivingLook(keys).yaw, Math.PI)
  releaseDrivingKey(keys, 'f')
  assert.equal(drivingLook(keys).yaw, 0.62)
  releaseDrivingKey(keys, 'z')
  pressDrivingKey(keys, 'x')
  assert.equal(drivingLook(keys).yaw, -0.62)
  releaseDrivingKey(keys, 'x')
  assert.equal(drivingLook(keys).yaw, 0)
})

test('help, center and sequential shifts normalize physical keys and ignore repeats', () => {
  for (const [code, key, expected] of [['KeyH', 'H', 'h'], ['KeyJ', 'j', 'j'], ['BracketLeft', '{', '['], ['BracketRight', '}', ']']] as const) {
    const normalized = drivingKey({ code, key })!
    assert.equal(normalized, expected)
    const held: DrivingKeys = {}
    assert.equal(pressDrivingKey(held, normalized), true)
    assert.equal(pressDrivingKey(held, normalized, true), false)
  }
})


test('number keys expose exact fixed throttle levels and highest held level wins', () => {
  const keys: DrivingKeys = {}
  assert.equal(fixedThrottleFromDrivingKeys(keys), null)
  pressDrivingKey(keys, '1')
  assert.equal(fixedThrottleFromDrivingKeys(keys), 0.1)
  pressDrivingKey(keys, '5')
  assert.equal(fixedThrottleFromDrivingKeys(keys), 0.5)
  pressDrivingKey(keys, '9')
  assert.equal(fixedThrottleFromDrivingKeys(keys), 0.9)
  releaseDrivingKey(keys, '9')
  assert.equal(fixedThrottleFromDrivingKeys(keys), 0.5)
  clearDrivingKeys(keys)
  assert.equal(fixedThrottleFromDrivingKeys(keys), null)
})

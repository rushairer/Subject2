import assert from 'node:assert/strict'
import test from 'node:test'
import { nearestReplaySample } from '../src/replay/replayContext'

const samples = [
  { t: 1.0, project: 'reverse-parking', speed: 1 },
  { t: 1.2, project: 'reverse-parking', speed: 2 },
  { t: 1.4, project: 'side-parking', speed: 3 },
]

test('nearestReplaySample stays inside the infraction project', () => {
  const result = nearestReplaySample(samples, 'reverse-parking', 1.35)
  assert.equal(result?.t, 1.2)
  assert.equal(result?.speed, 2)
})

test('nearestReplaySample supports transition project ids exactly', () => {
  const transition = [
    { t: 4.0, project: 'transition:reverse-parking:side-parking' },
    { t: 4.3, project: 'side-parking' },
  ]
  const result = nearestReplaySample(
    transition,
    'transition:reverse-parking:side-parking',
    4.2,
  )
  assert.equal(result?.t, 4.0)
})

test('nearestReplaySample returns null without timestamp or matching project', () => {
  assert.equal(nearestReplaySample(samples, undefined, 1.2), null)
  assert.equal(nearestReplaySample(samples, 'reverse-parking', undefined), null)
  assert.equal(nearestReplaySample(samples, 'subject3', 1.2), null)
})

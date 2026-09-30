import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SUSPENSION_VISUAL,
  createSuspensionVisualState,
  stepSuspensionVisual,
  suspensionTargetPose,
  transformPointBySuspensionVisual,
} from '../src/sim/vehicleSuspensionVisual'

test('braking dives the nose and acceleration raises it', () => {
  const braking = suspensionTargetPose(-8, 0)
  const accelerating = suspensionTargetPose(3, 0)

  assert.ok(braking.pitch < 0)
  assert.ok(accelerating.pitch > 0)
  assert.equal(braking.roll, 0)
})

test('rightward lateral acceleration rolls the body onto the left outside tires', () => {
  const pose = suspensionTargetPose(0, 6)
  assert.ok(pose.roll > 0)
  assert.equal(pose.pitch, 0)
})

test('visual suspension targets remain bounded under corrupt extreme telemetry', () => {
  const pose = suspensionTargetPose(-1000, 1000)
  assert.equal(pose.pitch, -SUSPENSION_VISUAL.maxPitchRadians)
  assert.equal(pose.roll, SUSPENSION_VISUAL.maxRollRadians)
})

test('spring response approaches load-derived attitude without snapping', () => {
  let state = createSuspensionVisualState()
  const target = suspensionTargetPose(-8, 5)

  state = stepSuspensionVisual(state, target, 1 / 60)
  assert.ok(Math.abs(state.pitch) > 0)
  assert.ok(Math.abs(state.pitch) < Math.abs(target.pitch))
  assert.ok(Math.abs(state.roll) > 0)
  assert.ok(Math.abs(state.roll) < Math.abs(target.roll))

  for (let frame = 0; frame < 180; frame += 1) {
    state = stepSuspensionVisual(state, target, 1 / 60)
  }
  assert.ok(Math.abs(state.pitch - target.pitch) < 0.001)
  assert.ok(Math.abs(state.roll - target.roll) < 0.001)
})

test('visual suspension returns close to neutral after acceleration clears', () => {
  let state = createSuspensionVisualState()
  const loaded = suspensionTargetPose(-7, -5)
  for (let frame = 0; frame < 90; frame += 1) {
    state = stepSuspensionVisual(state, loaded, 1 / 60)
  }
  for (let frame = 0; frame < 180; frame += 1) {
    state = stepSuspensionVisual(state, { pitch: 0, roll: 0 }, 1 / 60)
  }

  assert.ok(Math.abs(state.pitch) < 0.001)
  assert.ok(Math.abs(state.roll) < 0.001)
})


test('driver eye follows nose dive and outside roll around the shared visual center', () => {
  const eye = { x: -0.43, y: 1.36, z: 0.18 }

  const braking = transformPointBySuspensionVisual(
    eye,
    suspensionTargetPose(-8, 0),
  )
  // Eye is behind the pitch center, so a nose dive raises the rear cabin
  // slightly while the front coachwork lowers.
  assert.ok(braking.y > eye.y)

  const rightTurn = transformPointBySuspensionVisual(
    eye,
    suspensionTargetPose(0, 6),
  )
  // Driver sits left of center; positive roll loads/lowers the left side.
  assert.ok(rightTurn.y < eye.y)
})

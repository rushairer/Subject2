import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SUBJECT3_CROSSING_DURATION_SECONDS,
  SUBJECT3_CROSSWALK_PROGRESS,
  SUBJECT3_OVERTAKE_TARGET_PROGRESS,
  createSubject3TrafficState,
  crossingPedestrianMotion,
} from '../src/subject3/subject3Traffic'
import {
  CENTER_LINE_OFFSET,
  RIGHT_EDGE_OFFSET,
  SUBJECT3_EVENTS,
} from '../src/subject3/subject3Route'

test('crosswalk traffic state starts clear', () => {
  assert.deepEqual(createSubject3TrafficState(), {
    crosswalkPedestrianConflict: false,
  })
})

test('crossing pedestrian uses the rendered crosswalk progress', () => {
  const motion = crossingPedestrianMotion(false, 0)
  assert.equal(motion.progress, SUBJECT3_CROSSWALK_PROGRESS)
  assert.equal(motion.conflict, false)
})

test('pedestrian conflict is true only while the actor occupies our carriageway', () => {
  const beforeRoad = crossingPedestrianMotion(true, 0)
  assert.ok(beforeRoad.lateral > RIGHT_EDGE_OFFSET)
  assert.equal(beforeRoad.conflict, false)

  const entering = crossingPedestrianMotion(true, 1.0)
  assert.ok(entering.lateral <= RIGHT_EDGE_OFFSET)
  assert.ok(entering.lateral >= CENTER_LINE_OFFSET)
  assert.equal(entering.conflict, true)

  const crossed = crossingPedestrianMotion(
    true,
    SUBJECT3_CROSSING_DURATION_SECONDS,
  )
  assert.ok(crossed.lateral < CENTER_LINE_OFFSET)
  assert.equal(crossed.conflict, false)
})

test('pedestrian motion is clamped after the crossing completes', () => {
  const atEnd = crossingPedestrianMotion(
    true,
    SUBJECT3_CROSSING_DURATION_SECONDS,
  )
  const later = crossingPedestrianMotion(
    true,
    SUBJECT3_CROSSING_DURATION_SECONDS + 20,
  )
  assert.deepEqual(later, atEnd)
})


test('overtake target sits inside the modeled overtake event window', () => {
  const event = SUBJECT3_EVENTS.find(item => item.id === 'overtake')
  assert.ok(event)
  assert.ok(SUBJECT3_OVERTAKE_TARGET_PROGRESS > event.start)
  assert.ok(SUBJECT3_OVERTAKE_TARGET_PROGRESS < event.end)
})

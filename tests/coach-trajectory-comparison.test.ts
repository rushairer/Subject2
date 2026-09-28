import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  coachDeviationStats,
  coachReferencePathForReplay,
  distanceToCoachPath,
} from '../src/replay/coachTrajectoryComparison'
import { subject2StartPose } from '../src/subject2/courseStartPoses'
import { subject2ExamTransitions } from '../src/subject2/subject2ExamLayout'

test('standalone Subject 2 replay uses the local golden-driver path', () => {
  const project = 'right-angle'
  const path = coachReferencePathForReplay(project, true)
  const start = subject2StartPose(project)

  assert.ok(path.length > 10)
  assert.deepEqual(path[0], { x: start.x, z: start.z })
})

test('continuous connector replay uses the world-space connector plan', () => {
  const transition = subject2ExamTransitions(false)[0]
  const project = `transition:${transition.from}:${transition.to}`
  const path = coachReferencePathForReplay(project, false)

  assert.ok(path.length > 2)
  assert.ok(Math.hypot(
    path[0].x - transition.start.x,
    path[0].z - transition.start.z,
  ) < 1e-9)
  const end = path[path.length - 1]
  assert.ok(Math.hypot(
    end.x - transition.end.x,
    end.z - transition.end.z,
  ) < 0.7)
})

test('legacy connector replay can recover the sequence when automatic metadata is missing', () => {
  const transition = subject2ExamTransitions(false)
    .find(item => item.to === 'slope-start')
  assert.ok(transition)

  const project = `transition:${transition.from}:${transition.to}`
  const path = coachReferencePathForReplay(project, true)

  assert.ok(path.length > 2)
  assert.ok(Math.hypot(
    path[0].x - transition.start.x,
    path[0].z - transition.start.z,
  ) < 1e-9)
})

test('distanceToCoachPath measures nearest segment rather than nearest waypoint', () => {
  const distance = distanceToCoachPath(
    { x: 3, z: 2 },
    [{ x: 0, z: 0 }, { x: 6, z: 0 }],
  )
  assert.equal(distance, 2)
})

test('coach deviation stats expose average, maximum and the max sample index', () => {
  const stats = coachDeviationStats(
    [
      { x: 0, z: 0 },
      { x: 2, z: 1 },
      { x: 4, z: 2 },
    ],
    [{ x: 0, z: 0 }, { x: 4, z: 0 }],
  )
  assert.ok(stats)
  assert.equal(stats.maxMeters, 2)
  assert.equal(stats.maxIndex, 2)
  assert.ok(Math.abs(stats.averageMeters - 1) < 1e-9)
  assert.deepEqual(stats.distances, [0, 1, 2])
})

test('Subject 3 replay has no Subject 2 coach reference overlay', () => {
  assert.deepEqual(coachReferencePathForReplay('subject3', true), [])
})

const replaySource = readFileSync(
  new URL('../src/replay/ExamReplay.tsx', import.meta.url),
  'utf8',
)

test('replay UI renders coach reference and deviation evidence without changing scoring', () => {
  assert.match(replaySource, /replay-coach-path/)
  assert.match(replaySource, /平均偏差/)
  assert.match(replaySource, /最大偏差/)
  assert.match(replaySource, /距教练标准轨迹/)
  assert.doesNotMatch(replaySource, /coachDeviation.*points/)
  assert.doesNotMatch(replaySource, /coachDeviation.*fatal/)
})

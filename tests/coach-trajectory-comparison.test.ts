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
import { SUBJECT3_COACH_PULL_OVER_STOP_PROGRESS } from '../src/coach/subject3Coach'
import { projectToSubject3Route } from '../src/subject3/subject3Route'
import { subject3PracticeSliceById } from '../src/subject3/subject3Practice'

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

test('Subject 3 replay uses the production Golden Driver road geometry', () => {
  const c1 = coachReferencePathForReplay('subject3', false)
  const c2 = coachReferencePathForReplay('subject3', true)

  assert.deepEqual(c1, c2)
  assert.ok(c1.length > 800)

  const start = projectToSubject3Route(c1[0]!.x, c1[0]!.z)
  assert.ok(start.progress < 0.2)
  assert.ok(Math.abs(start.lateral) < 0.05)

  const laneChange = c1[Math.round(1950 / 5)]!
  const laneChangeProjection = projectToSubject3Route(
    laneChange.x,
    laneChange.z,
  )
  assert.ok(Math.abs(laneChangeProjection.progress - 1950) < 0.3)
  assert.ok(Math.abs(laneChangeProjection.lateral + 2.2) < 0.05)

  const overtake = c1[Math.round(2130 / 5)]!
  const overtakeProjection = projectToSubject3Route(
    overtake.x,
    overtake.z,
  )
  assert.ok(Math.abs(overtakeProjection.progress - 2130) < 0.3)
  assert.ok(Math.abs(overtakeProjection.lateral + 2.2) < 0.05)

  const stop = projectToSubject3Route(
    c1[c1.length - 1]!.x,
    c1[c1.length - 1]!.z,
  )
  assert.ok(
    Math.abs(stop.progress - SUBJECT3_COACH_PULL_OVER_STOP_PROGRESS) < 0.3,
  )
  assert.ok(Math.abs(stop.lateral - 0.6) < 0.05)
})

test('Subject 3 practice replay crops the coach reference to the targeted route window', () => {
  const slice = subject3PracticeSliceById('lane-change')
  const c1 = coachReferencePathForReplay(
    'subject3',
    false,
    'lane-change',
  )
  const c2 = coachReferencePathForReplay(
    'subject3',
    true,
    'lane-change',
  )

  assert.deepEqual(c1, c2)
  assert.ok(c1.length > 20)
  assert.ok(c1.length < 100)

  const start = projectToSubject3Route(c1[0]!.x, c1[0]!.z)
  const end = projectToSubject3Route(
    c1[c1.length - 1]!.x,
    c1[c1.length - 1]!.z,
  )
  assert.ok(Math.abs(start.progress - slice.startDistance) < 0.3)
  assert.ok(Math.abs(end.progress - slice.endDistance) < 0.3)

  const sampleProgress = 1950
  const sampleIndex = Math.round(
    (sampleProgress - slice.startDistance) / 5,
  )
  const laneChange = projectToSubject3Route(
    c1[sampleIndex]!.x,
    c1[sampleIndex]!.z,
  )
  assert.ok(Math.abs(laneChange.progress - sampleProgress) < 0.3)
  assert.ok(Math.abs(laneChange.lateral + 2.2) < 0.05)
})

test('pull-over practice coach reference stops at the production secured-stop point', () => {
  const path = coachReferencePathForReplay(
    'subject3',
    true,
    'pull-over',
  )
  const stop = projectToSubject3Route(
    path[path.length - 1]!.x,
    path[path.length - 1]!.z,
  )
  assert.ok(
    Math.abs(stop.progress - SUBJECT3_COACH_PULL_OVER_STOP_PROGRESS) < 0.3,
  )
  assert.ok(Math.abs(stop.lateral - 0.6) < 0.05)
})

const replaySource = readFileSync(
  new URL('../src/replay/ExamReplay.tsx', import.meta.url),
  'utf8',
)
const appSource = readFileSync(
  new URL('../src/App.tsx', import.meta.url),
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

test('Subject 3 practice scope reaches both replay reference layers', () => {
  assert.match(replaySource, /referenceLinesForProject\([\s\S]*subject3Practice/)
  assert.match(replaySource, /coachReferencePathForReplay\([\s\S]*subject3Practice/)
  assert.match(replaySource, /科目三专项/)
  assert.match(appSource, /subject3Practice=\{session\.subject3Practice\}/)
})

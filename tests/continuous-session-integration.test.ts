import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  advanceExamProgress, completeExamProject, createExamProgress,
  enterExamProject, isExamComplete,
} from '../src/session/examProgress'
import { subject2ExamSequence } from '../src/subject2/subject2ExamLayout'

for (const automatic of [false, true]) {
  test(`${automatic ? 'C2' : 'C1'} visits every canonical course without stale completion skipping`, () => {
    const sequence = subject2ExamSequence(automatic)
    assert.equal(sequence.length, automatic ? 4 : 5)
    assert.equal(sequence.includes('slope-start'), !automatic)
    let progress = createExamProgress(sequence[0])
    const visited: string[] = []
    for (const project of sequence) {
      assert.equal(progress.project, project)
      visited.push(project)
      assert.equal(isExamComplete(progress, sequence), false)
      progress = enterExamProject(progress, project)
      progress = completeExamProject(progress, project)
      const next = advanceExamProgress(progress, sequence)
      if (next !== progress) {
        assert.equal(next.completed, false)
        assert.equal(next.entered, false)
        assert.equal(completeExamProject(next, project), next)
        assert.equal(advanceExamProgress(next, sequence), next)
      }
      progress = next
    }
    assert.deepEqual(visited, sequence)
    assert.equal(isExamComplete(progress, sequence), true)
  })
}

// These source contracts protect lifecycle wiring that pure judge tests cannot see.
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('course changes do not key-remount the driving world or its cockpit', () => {
  assert.doesNotMatch(app, /<DrivingWorld\b[^>]*\bkey=/)
  assert.match(app, /if \(runtimeProject\.current !== session\.examId\)/)
  assert.match(app, /projectJudgingEnabled=\{!navigatingToProject\}/)
  assert.match(app, /if \(projectJudgingEnabled\)/)
})

test('keyboard listeners stay independent of camera mode and clear on focus loss', () => {
  const begin = app.indexOf('const syncLook = () =>')
  const end = app.indexOf('useFrame((_, rawDt)', begin)
  assert.ok(begin > 0 && end > begin)
  const inputEffect = app.slice(begin, end)
  assert.match(inputEffect, /addEventListener\('blur', releaseAll\)/)
  assert.match(inputEffect, /addEventListener\('visibilitychange', visibilityChanged\)/)
  assert.match(inputEffect, /\[automatic, onCycleCameraMode, vehicle\]/)
  assert.doesNotMatch(inputEffect, /\[automatic, cameraMode/)
})

test('all termination paths share the exactly-once finish guard and completion result', () => {
  const begin = app.indexOf('function Driving(')
  const end = app.indexOf('function Result(', begin)
  const driving = app.slice(begin, end)
  assert.equal((driving.match(/onDone\(/g) ?? []).length, 1)
  assert.match(driving, /onDone\(score, infractions, trajectory\.current, sessionComplete\)/)
  assert.match(driving, /if \(finishLatched\.current\) return/)
  assert.match(driving, /onClick=\{finishSession\}/)
})

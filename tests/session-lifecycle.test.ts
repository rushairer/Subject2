import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advanceExamProgress, completeExamProject, createExamProgress,
  enterExamProject, isExamComplete,
} from '../src/session/examProgress.ts'
import { assessSessionResult } from '../src/session/sessionResult.ts'

const sequence = ['first', 'second', 'third'] as const

test('unfinished courses cannot advance or finish an exam', () => {
  const progress = createExamProgress<string>('first')
  assert.equal(advanceExamProgress(progress, sequence), progress)
  assert.equal(isExamComplete(progress, sequence), false)
})

test('advancing clears completion and entry atomically, without skipping a course', () => {
  const completed = completeExamProject(createExamProgress<string>('first'), 'first')
  const next = advanceExamProgress(completed, sequence)
  assert.deepEqual(next, { project: 'second', entered: false, completed: false })
  assert.equal(advanceExamProgress(next, sequence), next)
  assert.equal(isExamComplete(completed, sequence), false)
})

test('stale completion and entry callbacks cannot mutate the next course', () => {
  const next = createExamProgress<string>('second', false)
  assert.equal(completeExamProject(next, 'first'), next)
  assert.equal(enterExamProject(next, 'first'), next)
  assert.equal(completeExamProject(next, 'second'), next)
})

test('entry and completion updates are idempotent', () => {
  const entered = enterExamProject(createExamProgress<string>('second', false), 'second')
  assert.equal(enterExamProject(entered, 'second'), entered)
  const completed = completeExamProject(entered, 'second')
  assert.equal(completeExamProject(completed, 'second'), completed)
})

test('each course must be entered and completed before a continuous exam finishes', () => {
  let progress = createExamProgress<string>(sequence[0])
  for (const project of sequence) {
    assert.equal(progress.project, project)
    assert.equal(isExamComplete(progress, sequence), false)
    progress = enterExamProject(progress, project)
    progress = completeExamProject(progress, project)
    assert.equal(isExamComplete(progress, sequence), project === 'third')
    progress = advanceExamProgress(progress, sequence)
  }
  assert.equal(isExamComplete(progress, sequence), true)
  assert.equal(advanceExamProgress(progress, sequence), progress)
})

test('standalone completion is distinct from full-exam completion', () => {
  const progress = completeExamProject(createExamProgress<string>('first'), 'first')
  assert.equal(isExamComplete(progress), true)
  assert.equal(isExamComplete(progress, sequence), false)
  assert.equal(isExamComplete(progress, []), false)
})

test('unknown courses never advance through a sequence', () => {
  const progress = completeExamProject(createExamProgress<string>('other'), 'other')
  assert.equal(advanceExamProgress(progress, sequence), progress)
})

test('ending early at 100 points is incomplete, never passed', () => {
  for (const examId of ['reverse-parking', 'subject2-exam', 'subject3']) {
    const result = assessSessionResult({ examId, score: 100, completed: false, infractions: [] })
    assert.equal(result.passed, false)
    assert.equal(result.status, 'incomplete')
  }
})

test('score thresholds apply only after completion', () => {
  for (const [examId, threshold] of [['subject2-exam', 80], ['subject3', 90]] as const) {
    assert.equal(assessSessionResult({ examId, score: threshold, completed: true, infractions: [] }).status, 'passed')
    assert.equal(assessSessionResult({ examId, score: threshold, completed: false, infractions: [] }).status, 'incomplete')
    assert.equal(assessSessionResult({ examId, score: threshold - 1, completed: true, infractions: [] }).status, 'failed')
    assert.equal(assessSessionResult({ examId, score: threshold - 1, completed: false, infractions: [] }).status, 'failed')
  }
})

test('fatal penalties and invalid scores never pass, including on the final frame', () => {
  for (const completed of [true, false]) {
    assert.equal(assessSessionResult({ examId: 'subject2-exam', score: 100, completed, infractions: [{ fatal: true }] }).status, 'failed')
    for (const score of [NaN, Infinity, -Infinity]) {
      assert.equal(assessSessionResult({ examId: 'subject2-exam', score, completed, infractions: [] }).passed, false)
    }
  }
})

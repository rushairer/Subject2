import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  createCoachDemoSession,
  isCoachDemoSession,
  shouldPersistPersonalResult,
} from '../src/coach/coachDemoSession'

test('coach demo session starts in practice mode and carries explicit demo identity', () => {
  assert.deepEqual(
    createCoachDemoSession('subject2-exam', 'day'),
    {
      examId: 'subject2-exam',
      mode: 'practice',
      time: 'day',
      coachDemo: true,
    },
  )
  assert.deepEqual(
    createCoachDemoSession('subject3', 'night'),
    {
      examId: 'subject3',
      mode: 'practice',
      time: 'night',
      coachDemo: true,
    },
  )
})

test('only explicit coach demos are excluded from personal-result persistence', () => {
  assert.equal(isCoachDemoSession({ coachDemo: true }), true)
  assert.equal(isCoachDemoSession({ coachDemo: false }), false)
  assert.equal(isCoachDemoSession({}), false)

  assert.equal(shouldPersistPersonalResult({ coachDemo: true }), false)
  assert.equal(shouldPersistPersonalResult({ coachDemo: false }), true)
  assert.equal(shouldPersistPersonalResult({}), true)
})

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('training center demo sessions auto-take over and personal sessions keep normal persistence', () => {
  assert.match(app, /aria-label="教练示范"/)
  assert.match(app, /科目二完整示范/)
  assert.match(app, /科目三完整示范/)
  assert.match(app, /createCoachDemoSession\('subject2-exam', time\)/)
  assert.match(app, /createCoachDemoSession\('subject3', time\)/)
  assert.match(app, /useState\(\(\) => isCoachDemoSession\(session\)\)/)
  assert.match(app, /if \(shouldPersistPersonalResult\(session\)\)/)
  assert.match(app, /示范成绩不会写入个人训练记录/)
  assert.match(app, /不计入你的个人成绩、训练趋势或训练计划/)
})

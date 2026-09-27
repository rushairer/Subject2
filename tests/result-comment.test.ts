import assert from 'node:assert/strict'
import test from 'node:test'
import { buildResultComment } from '../src/session/resultComment.ts'

test('result commentary is deterministic for the same result', () => {
  const input = {
    examTitle: '科目二模拟考试',
    score: 96,
    passLine: 80,
    status: 'passed' as const,
    resultLabel: '合格',
    infractionTitles: ['倒车入库压线'],
    fatalCount: 0,
  }
  assert.deepEqual(buildResultComment(input), buildResultComment(input))
})

test('perfect clean runs get a celebratory shareable comment', () => {
  const comment = buildResultComment({
    examTitle: '科目二模拟考试',
    score: 100,
    passLine: 80,
    status: 'passed',
    resultLabel: '合格',
    infractionTitles: [],
    fatalCount: 0,
  })
  assert.ok(comment.badge.length > 0)
  assert.match(comment.detail, /零扣分/)
  assert.match(comment.shareText, /100 分 · 合格/)
})

test('passing on the threshold stays playful without changing the outcome', () => {
  const comment = buildResultComment({
    examTitle: '科目二模拟考试',
    score: 80,
    passLine: 80,
    status: 'passed',
    resultLabel: '合格',
    infractionTitles: ['曲线行驶压线'],
    fatalCount: 0,
  })
  assert.ok(comment.badge.length > 0)
  assert.match(comment.shareText, /80 分 · 合格/)
})

test('fatal failures call out the recorded turning point', () => {
  const comment = buildResultComment({
    examTitle: '倒车入库',
    score: 100,
    passLine: 80,
    status: 'failed',
    resultLabel: '未合格',
    infractionTitles: ['车身出线'],
    fatalCount: 1,
  })
  assert.ok(comment.badge.length > 0)
  assert.match(comment.detail, /车身出线/)
  assert.match(comment.shareText, /未合格/)
})

test('incomplete high scores never read like a pass', () => {
  const comment = buildResultComment({
    examTitle: '科目二模拟考试',
    score: 100,
    passLine: 80,
    status: 'incomplete',
    resultLabel: '未完成',
    infractionTitles: [],
    fatalCount: 0,
  })
  assert.ok(comment.badge.length > 0)
  assert.match(comment.detail, /只是当前已记录的操作/)
  assert.match(comment.shareText, /未完成/)
})


test('recorded infractions can add a contextual roast without changing the score text', () => {
  const comment = buildResultComment({
    examTitle: '曲线行驶',
    score: 82,
    passLine: 80,
    status: 'passed',
    resultLabel: '合格',
    infractionTitles: ['车轮压线'],
    fatalCount: 0,
  })
  assert.match(comment.detail, /车轮压线/)
  assert.match(comment.detail, /缘分确实有点过头/)
  assert.match(comment.shareText, /82 分 · 合格/)
})

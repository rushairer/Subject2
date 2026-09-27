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
  assert.match(comment.detail, /线|边线|车轮|考试线|精准度|贴脸/)
  assert.match(comment.shareText, /82 分 · 合格/)
})


test('tree collisions get a tree-specific coach roast', () => {
  const comment = buildResultComment({
    examTitle: '科目三道路驾驶',
    score: 0,
    passLine: 90,
    status: 'failed',
    resultLabel: '未合格',
    infractionTitles: ['道路驾驶过程中与树木发生碰撞'],
    fatalCount: 1,
  })
  assert.match(comment.detail, /树木发生碰撞/)
  assert.match(comment.detail, /树|绿化|自然/)
})

test('cone collisions support both official cone wording and the common snow-cone nickname', () => {
  for (const title of [
    '道路驾驶过程中与锥桶发生碰撞',
    '倒车时撞到雪糕桶',
  ]) {
    const comment = buildResultComment({
      examTitle: '科目二模拟考试',
      score: 70,
      passLine: 80,
      status: 'failed',
      resultLabel: '未合格',
      infractionTitles: [title],
      fatalCount: 0,
    })
    assert.match(comment.detail, /锥桶|雪糕桶|路锥|工伤|碰撞测试|线下见面|主动社交|闪现|绕桩/)
  }
})

test('seatbelt infractions get a specific reminder rather than a generic failure line', () => {
  const comment = buildResultComment({
    examTitle: '科目三道路驾驶',
    score: 0,
    passLine: 90,
    status: 'failed',
    resultLabel: '未合格',
    infractionTitles: ['科目三道路驾驶过程中未按规定使用安全带'],
    fatalCount: 1,
  })
  assert.match(comment.detail, /安全带/)
  assert.match(comment.detail, /肩膀|伸手|功能|两秒|安全意识|遗忘|固定/)
})

test('vehicle collisions read like a driving-specific coach comment', () => {
  const comment = buildResultComment({
    examTitle: '科目三道路驾驶',
    score: 0,
    passLine: 90,
    status: 'failed',
    resultLabel: '未合格',
    infractionTitles: ['道路驾驶过程中与车辆发生碰撞'],
    fatalCount: 1,
  })
  assert.match(comment.detail, /车辆发生碰撞/)
  assert.match(comment.detail, /交通参与者|跟车|会师|保险公司|并线|车身接触/)
})


test('non-scoring cone incidents still influence the shareable coach comment', () => {
  const comment = buildResultComment({
    examTitle: '侧方停车',
    score: 100,
    passLine: 80,
    status: 'passed',
    resultLabel: '合格',
    infractionTitles: [],
    incidentTitles: ['侧方停车时撞到锥桶'],
    fatalCount: 0,
  })
  assert.match(comment.detail, /现场花絮/)
  assert.match(comment.detail, /撞到锥桶/)
  assert.match(comment.detail, /锥桶|雪糕桶|工伤|碰撞测试|线下见面|主动社交|闪现|绕桩/)
  assert.doesNotMatch(comment.detail, /零扣分事件。今天的方向盘和你意见高度一致。$/)
  assert.match(comment.shareText, /100 分 · 合格/)
})


test('a cone incident can take over the headline even when the score is perfect', () => {
  const comment = buildResultComment({
    examTitle: '侧方停车',
    score: 100,
    passLine: 80,
    status: 'passed',
    resultLabel: '合格',
    infractionTitles: [],
    incidentTitles: ['侧方停车时撞到锥桶'],
    fatalCount: 0,
  })
  assert.match(comment.badge, /精准命中|锥桶受害者协会|点位很特别|现场有桶/)
  assert.match(comment.headline, /锥桶|雪糕桶|桩|100 分/)
  assert.match(comment.detail, /成绩单确实是零扣分/)
  assert.match(comment.detail, /现场花絮/)
})

test('a later tree collision is more useful to roast than an earlier generic minor error', () => {
  const comment = buildResultComment({
    examTitle: '科目三道路驾驶',
    score: 0,
    passLine: 90,
    status: 'failed',
    resultLabel: '未合格',
    infractionTitles: [
      '直线行驶方向控制不稳',
      '道路驾驶过程中与树木发生碰撞',
    ],
    fatalCount: 1,
  })
  assert.match(comment.badge, /绿化亲密接触|树：我没动|路线过于自然/)
  assert.match(comment.headline, /树|绿化|路/)
  assert.match(comment.detail, /教练重点点评：道路驾驶过程中与树木发生碰撞/)
})

test('multiple cone contacts get a combined coach comment instead of hiding after the first one', () => {
  const comment = buildResultComment({
    examTitle: '科目二模拟考试',
    score: 90,
    passLine: 80,
    status: 'passed',
    resultLabel: '合格',
    infractionTitles: [],
    incidentTitles: [
      '倒车入库时撞到锥桶',
      '侧方停车时撞到锥桶',
      '直角转弯时撞到锥桶',
    ],
    fatalCount: 0,
  })
  assert.match(comment.detail, /共与 3 个锥桶发生接触/)
  assert.match(comment.detail, /给锥桶点名/)
})

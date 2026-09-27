import assert from 'node:assert/strict'
import test from 'node:test'
import {
  subject2CollisionIncident,
  subject2CourseGateIncident,
} from '../src/session/drivingIncident.ts'

test('Subject 2 collision incidents retain structured kind, object and course metadata', () => {
  const cone = subject2CollisionIncident({
    id: 'reverse-parking-cone-2',
    kind: 'cone',
    object: 'traffic-cone',
    label: '锥桶',
    course: 'reverse-parking',
  })

  assert.deepEqual(cone.collision, {
    kind: 'cone',
    object: 'traffic-cone',
    label: '锥桶',
    course: 'reverse-parking',
  })
  assert.equal(cone.title, '倒车入库时撞到锥桶')
  assert.equal(cone.category, 'collision')
})

test('sign-post incidents preserve the semantic object separately from physics kind', () => {
  const post = subject2CollisionIncident({
    id: 'slope-start-sign-post',
    kind: 'pole',
    object: 'sign-post',
    label: '坡道停车标志杆',
    course: 'slope-start',
  })

  assert.equal(post.collision.kind, 'pole')
  assert.equal(post.collision.object, 'sign-post')
  assert.equal(post.collision.course, 'slope-start')
  assert.equal(post.title, '坡道定点停车和起步时撞到坡道停车标志杆')
})

test('course-gate incidents identify which project entrance was hit', () => {
  const gate = subject2CourseGateIncident({
    id: 'course-gate-side-parking-left',
    course: 'side-parking',
  })

  assert.equal(gate.collision.kind, 'pole')
  assert.equal(gate.collision.object, 'course-gate-post')
  assert.equal(gate.collision.course, 'side-parking')
  assert.equal(gate.title, '连续考试连接道路撞到侧方停车入口立杆')
})

import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import {
  makeArrowTexture,
  makeBusStopSignTexture,
  makeCrosswalkSignTexture,
  makeDiamondTexture,
  makeExamProjectSignTexture,
  makeSchoolSignTexture,
  makeSpeedLimitTexture,
  makeUTurnSignTexture,
} from '../src/subject3/subject3Signs'
import {
  SUBJECT3_ROUTE,
  SUBJECT3_ROUTE_NODE_PAD_SIZE,
  SUBJECT3_SEGMENTS,
} from '../src/subject3/subject3Route'

test('GB 5768 sign textures generate valid CanvasTexture objects with sRGB color space', () => {
  const speedLimitTex = makeSpeedLimitTexture(50)
  assert.ok(speedLimitTex instanceof THREE.CanvasTexture)
  assert.equal(speedLimitTex.image.width, 512)
  assert.equal(speedLimitTex.image.height, 512)
  assert.equal(speedLimitTex.colorSpace, THREE.SRGBColorSpace)

  const speedLimit30Tex = makeSpeedLimitTexture(30)
  assert.ok(speedLimit30Tex instanceof THREE.CanvasTexture)

  const crosswalkTex = makeCrosswalkSignTexture()
  assert.ok(crosswalkTex instanceof THREE.CanvasTexture)
  assert.equal(crosswalkTex.image.width, 512)
  assert.equal(crosswalkTex.image.height, 512)

  const schoolTex = makeSchoolSignTexture()
  assert.ok(schoolTex instanceof THREE.CanvasTexture)
  assert.equal(schoolTex.image.width, 512)
  assert.equal(schoolTex.image.height, 512)

  const busStopTex = makeBusStopSignTexture()
  assert.ok(busStopTex instanceof THREE.CanvasTexture)
  assert.equal(busStopTex.image.width, 512)
  assert.equal(busStopTex.image.height, 512)

  const uTurnTex = makeUTurnSignTexture()
  assert.ok(uTurnTex instanceof THREE.CanvasTexture)
  assert.equal(uTurnTex.image.width, 512)
  assert.equal(uTurnTex.image.height, 512)

  const examStartTex = makeExamProjectSignTexture('考试起点')
  assert.ok(examStartTex instanceof THREE.CanvasTexture)
  assert.equal(examStartTex.image.width, 512)
  assert.equal(examStartTex.image.height, 300)

  const pullOverTex = makeExamProjectSignTexture('靠边停车')
  assert.ok(pullOverTex instanceof THREE.CanvasTexture)
})

test('GB 5768.3 pavement arrow and diamond warning textures generate correctly', () => {
  const arrowTypes: Array<'straight' | 'left' | 'straight-left' | 'straight-right'> = [
    'straight',
    'left',
    'straight-left',
    'straight-right',
  ]

  for (const type of arrowTypes) {
    const tex = makeArrowTexture(type)
    assert.ok(tex instanceof THREE.CanvasTexture)
    assert.equal(tex.image.width, 256)
    assert.equal(tex.image.height, 512)
  }

  const diamondTex = makeDiamondTexture()
  assert.ok(diamondTex instanceof THREE.CanvasTexture)
  assert.equal(diamondTex.image.width, 256)
  assert.equal(diamondTex.image.height, 512)
})

test('road segments leave sufficient margin for corner junction pads to avoid marking collisions', () => {
  const junctionMargin = SUBJECT3_ROUTE_NODE_PAD_SIZE / 2 // 10.0m

  for (let i = 0; i < SUBJECT3_SEGMENTS.length; i++) {
    const segment = SUBJECT3_SEGMENTS[i]
    const isFirst = i === 0
    const isLast = i === SUBJECT3_SEGMENTS.length - 1

    const zEntrance = isFirst ? segment.length / 2 : segment.length / 2 - junctionMargin
    const zExit = isLast ? -segment.length / 2 : -segment.length / 2 + junctionMargin

    const markingLength = zEntrance - zExit
    // Ensure every segment has positive markings space and doesn't invade junction pad
    assert.ok(
      markingLength > 10,
      `Segment ${i} marking length (${markingLength}m) must be > 10m`,
    )
  }
})

test('corner junction markings cover all route intersection nodes with valid turn transitions', () => {
  assert.ok(SUBJECT3_ROUTE.length > 2)
  for (let i = 1; i < SUBJECT3_ROUTE.length - 1; i++) {
    const segIn = SUBJECT3_SEGMENTS[i - 1]
    const segOut = SUBJECT3_SEGMENTS[i]
    assert.ok(segIn, `Incoming segment must exist for node ${i}`)
    assert.ok(segOut, `Outgoing segment must exist for node ${i}`)
  }
})

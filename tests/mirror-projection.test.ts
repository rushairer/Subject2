import test from 'node:test'
import assert from 'node:assert/strict'
import { Matrix4, Quaternion, Vector3 } from 'three'
import { MirrorProjection } from '../src/cockpit/mirrorProjection'
import { DRIVER_EYE, VEHICLE_MIRRORS } from '../src/cockpit/mirrorLayout'

function close(actual: number, expected: number, label = '') {
  assert.ok(Math.abs(actual - expected) < 1e-7, `${label}: ${actual} != ${expected}`)
}
const identity = new Matrix4()

test('mirror reflects the eye across the actual plane and clips the space behind it', () => {
  const p = new MirrorProjection(), eye = new Vector3(0.2, 0.1, 0.8)
  assert.ok(p.update(identity, eye, 0.4, 0.2))
  close(p.camera.position.x, eye.x)
  close(p.camera.position.y, eye.y)
  close(p.camera.position.z, -eye.z)
  const behind = new Vector3(0, 0, -0.01).project(p.camera)
  const ahead = new Vector3(0, 0, 0.01).project(p.camera)
  assert.ok(behind.z < -1, 'housing and geometry behind glass must be clipped')
  assert.ok(ahead.z >= -1 && ahead.z <= 1)
})

test('all aperture corners fill the target exactly, without stretching from a guessed FOV', () => {
  for (const eye of [new Vector3(0, 0, 1), new Vector3(-0.7, 0.3, 0.5)]) {
    const p = new MirrorProjection()
    p.update(identity, eye, 0.32, 0.095)
    for (const x of [-0.16, 0.16]) for (const y of [-0.0475, 0.0475]) {
      const ndc = new Vector3(x, y, 0).project(p.camera)
      // The sampler performs one horizontal flip, restoring physical UV order.
      close((1 - ndc.x) / 2, x > 0 ? 1 : 0)
      close((ndc.y + 1) / 2, y > 0 ? 1 : 0)
    }
  }
})

test('rays obey equal incidence/reflection angles at every mirror sample after yaw/pitch/translation', () => {
  for (const heading of [0, Math.PI / 2, -1.23, Math.PI]) {
    const placement = new Matrix4().compose(new Vector3(14, 2, -30),
      new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), heading)
        .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.18)), new Vector3(1, 1, 1))
    for (const spec of VEHICLE_MIRRORS) {
      const surface = placement.clone().multiply(new Matrix4().compose(spec.position, spec.quaternion, new Vector3(1, 1, 1)))
      const eye = new Vector3(DRIVER_EYE.right, DRIVER_EYE.height, -DRIVER_EYE.forward).applyMatrix4(placement)
      const normal = new Vector3(0, 0, 1).transformDirection(surface)
      const p = new MirrorProjection()
      assert.ok(p.update(surface, eye, spec.width, spec.height))
      for (const u of [0.1, 0.5, 0.9]) for (const v of [0.1, 0.5, 0.9]) {
        const point = new Vector3((u - 0.5) * spec.width, (v - 0.5) * spec.height, 0).applyMatrix4(surface)
        const incoming = point.clone().sub(eye).normalize()
        const outgoing = incoming.clone().reflect(normal)
        close(incoming.dot(normal), -outgoing.dot(normal), 'law of reflection')
        for (const distance of [0.5, 4, 30]) {
          const object = point.clone().addScaledVector(outgoing, distance)
          const ndc = object.project(p.camera)
          close((1 - ndc.x) / 2, u, `${spec.id} horizontal position`)
          close((ndc.y + 1) / 2, v, `${spec.id} vertical position`)
          assert.ok(ndc.z >= -1 && ndc.z <= 1)
        }
      }
    }
  }
})

test('left/right mirror center rays reach their own rear targets, center reaches the rear window', () => {
  const eye = new Vector3(DRIVER_EYE.right, DRIVER_EYE.height, -DRIVER_EYE.forward)
  for (const spec of VEHICLE_MIRRORS) {
    const incoming = spec.position.clone().sub(eye).normalize()
    const normal = new Vector3(0, 0, 1).applyQuaternion(spec.quaternion)
    const reflected = incoming.reflect(normal)
    const expected = spec.target.clone().sub(spec.position).normalize()
    close(reflected.dot(expected), 1, spec.id)
    assert.ok(reflected.z > 0, 'must look behind the vehicle')
    if (spec.id === 'left') assert.ok(reflected.x < 0)
    if (spec.id === 'right') assert.ok(reflected.x > 0)
  }
})

test('head translation creates correct parallax; turning the head alone does not move mirror objects', () => {
  const p = new MirrorProjection(), object = new Vector3(0, 0, 5)
  p.update(identity, new Vector3(0, 0, 1), 0.4, 0.2)
  close(object.clone().project(p.camera).x, 0)
  p.update(identity, new Vector3(0.1, 0, 1), 0.4, 0.2)
  const uv = (1 - object.clone().project(p.camera).x) / 2
  // Analytic ray/plane intersection: x at plane = 0.1 * 5 / (5+1).
  close(uv, 0.5 + (0.1 * 5 / 6) / 0.4)
  // No head orientation/FOV input: a stationary physical mirror does not pan
  // its contents when the observer rotates their gaze or changes display FOV.
  const first = p.camera.projectionMatrix.clone()
  p.update(identity, new Vector3(0.1, 0, 1), 0.4, 0.2)
  assert.deepEqual(p.camera.projectionMatrix.elements, first.elements)
})

test('objects keep depth-dependent apparent size and physical left/right order', () => {
  const p = new MirrorProjection()
  p.update(identity, new Vector3(0, 0, 1), 0.4, 0.2)
  const u = (x: number, z: number) => (1 - new Vector3(x, 0, z).project(p.camera).x) / 2
  assert.ok(u(-0.1, 3) < u(0.1, 3), 'single horizontal flip, not a swapped rear camera view')
  close((u(0.1, 1) - u(-0.1, 1)) / (u(0.1, 3) - u(-0.1, 3)), 2)
})

test('backside and eye-on-plane cannot produce singular or visible false reflections', () => {
  const p = new MirrorProjection()
  for (const z of [-2, 0, 0.0001]) assert.equal(p.update(identity, new Vector3(0, 0, z), 0.3, 0.15), false)
  assert.equal(p.update(identity, new Vector3(0, 0, 1), 0, 0.15), false)
})

test('rounded glass UVs cover the whole physical aperture with no implicit second flip', async () => {
  const { mirrorGeometry } = await import('../src/cockpit/mirrorGeometry')
  for (const spec of VEHICLE_MIRRORS) {
    const geometry = mirrorGeometry(spec.width, spec.height, spec.radius)
    const uv = geometry.getAttribute('uv'), pos = geometry.getAttribute('position')
    for (let i = 0; i < uv.count; i++) {
      close(uv.getX(i), pos.getX(i) / spec.width + 0.5)
      close(uv.getY(i), pos.getY(i) / spec.height + 0.5)
      assert.ok(uv.getX(i) >= 0 && uv.getX(i) <= 1)
      assert.ok(uv.getY(i) >= 0 && uv.getY(i) <= 1)
    }
    geometry.dispose()
  }
})

test('side mirror calibration keeps the rear flank on its inner edge and the horizon in view', () => {
  const eye = new Vector3(DRIVER_EYE.right, DRIVER_EYE.height, -DRIVER_EYE.forward)
  for (const spec of VEHICLE_MIRRORS.filter(m => m.id !== 'center')) {
    const surface = new Matrix4().compose(spec.position, spec.quaternion, new Vector3(1, 1, 1))
    const p = new MirrorProjection()
    p.update(surface, eye, spec.width, spec.height)
    const flank = new Vector3(Math.sign(spec.position.x) * 0.9, 1.0, 2.1).project(p.camera)
    const u = (1 - flank.x) / 2, v = (flank.y + 1) / 2
    assert.ok(u >= 0 && u <= 1 && v >= 0 && v <= 1, `${spec.id} body reference visible`)
    assert.ok(spec.id === 'left' ? u > 0.75 : u < 0.25, `${spec.id} body reference on inner edge`)
    const horizon = spec.position.clone().add(spec.target.clone().sub(spec.position).setY(0).normalize().multiplyScalar(100)).project(p.camera)
    assert.ok(horizon.y > 0 && horizon.y < 1, `${spec.id} horizon in upper half`)
  }
})

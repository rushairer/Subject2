import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three'

/** Exact planar reflection through a finite mirror aperture (vehicle/world agnostic).
 * The camera basis is right-handed, so its X axis opposes the visible mirror's X.
 * RenderTarget sampling must flip U exactly once: repeat.x=-1, offset.x=1.
 * Unlike a fixed rear camera, this preserves parallax, scale and occlusion.
 */
export class MirrorProjection {
  readonly camera = new PerspectiveCamera()
  private center = new Vector3()
  private right = new Vector3()
  private up = new Vector3()
  private normal = new Vector3()
  private delta = new Vector3()
  private basis = new Matrix4()

  update(surfaceWorld: Matrix4, eye: Vector3, width: number, height: number, far = 260): boolean {
    const { camera, center, right, up, normal, delta, basis } = this
    center.setFromMatrixPosition(surfaceWorld)
    right.setFromMatrixColumn(surfaceWorld, 0).normalize()
    up.setFromMatrixColumn(surfaceWorld, 1).normalize()
    normal.setFromMatrixColumn(surfaceWorld, 2).normalize()
    const distance = delta.subVectors(eye, center).dot(normal)
    // Opaque back of a mirror, and no singular projection when the eye is on it.
    if (distance <= 0.001 || width <= 0 || height <= 0 || distance >= far) return false

    camera.position.copy(eye).addScaledVector(normal, -2 * distance)
    // Looking from the reflected eye through the mirror. No guessed lookAt/FOV.
    basis.set(
      -right.x, up.x, -normal.x, 0,
      -right.y, up.y, -normal.y, 0,
      -right.z, up.z, -normal.z, 0,
      0, 0, 0, 1,
    )
    camera.quaternion.setFromRotationMatrix(basis)
    camera.updateMatrixWorld(true)
    delta.subVectors(center, camera.position)
    const cx = -delta.dot(right)
    const cy = delta.dot(up)
    // The near plane IS the mirror: its housing and all geometry behind it
    // cannot leak into the reflection. Keep the full car visible to the camera.
    camera.near = distance + 0.0001
    camera.far = far
    const scale = camera.near / distance
    camera.projectionMatrix.makePerspective(
      (cx - width / 2) * scale, (cx + width / 2) * scale,
      (cy + height / 2) * scale, (cy - height / 2) * scale,
      camera.near, far,
    )
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
    return true
  }
}

/** Mount normal bisects the directions to the eye and the desired rear scene.
 * Returns a physical orientation; it never changes with head/look rotation.
 */
export function aimMirror(position: Vector3, eye: Vector3, rearTarget: Vector3): Quaternion {
  const normal = eye.clone().sub(position).normalize()
    .add(rearTarget.clone().sub(position).normalize()).normalize()
  const right = new Vector3(0, 1, 0).cross(normal).normalize()
  const up = normal.clone().cross(right).normalize()
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, up, normal))
}

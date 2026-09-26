import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { MirrorProjection } from './mirrorProjection'
import { mirrorGeometry } from './mirrorGeometry'
import { VEHICLE_MIRRORS } from './mirrorLayout'

/** Appearance and placement live here; testable optics live in mirrorProjection. */
export function VehicleMirrors() {
  const { gl, scene, camera } = useThree()
  const rigs = useMemo(() => VEHICLE_MIRRORS.map(spec => {
    const target = new THREE.WebGLRenderTarget(spec.textureWidth, spec.textureHeight, { depthBuffer: true, stencilBuffer: false })
    target.texture.colorSpace = THREE.SRGBColorSpace
    // Retain the known-good single horizontal flip, paired with the explicitly
    // right-handed reflected camera basis. Never add a second geometry UV flip.
    target.texture.wrapS = THREE.RepeatWrapping
    target.texture.repeat.x = -1
    target.texture.offset.x = 1
    target.texture.generateMipmaps = false
    target.texture.minFilter = THREE.LinearFilter
    target.texture.magFilter = THREE.LinearFilter
    const glassGeometry = mirrorGeometry(spec.width, spec.height, spec.radius)
    const material = new THREE.MeshBasicMaterial({ map: target.texture, toneMapped: false })
    const surface = new THREE.Mesh(glassGeometry, material)
    surface.name = `mirror-${spec.id}-surface`
    const housing = new RoundedBoxGeometry(spec.width + 0.025, spec.height + 0.025, spec.id === 'center' ? 0.027 : 0.068, 3, 0.014)
    return { spec, target, surface, housing, projection: new MirrorProjection() }
  }), [])
  const eye = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => () => {
    for (const rig of rigs) {
      rig.target.dispose(); rig.surface.geometry.dispose(); rig.surface.material.dispose(); rig.housing.dispose()
    }
  }, [rigs])

  useFrame(() => {
    // All default-priority physics, traffic and camera callbacks have finished.
    // This component owns rendering at priority 1: capture mirrors, then draw the
    // main view exactly once, without changing any simulation callback ordering.
    scene.updateMatrixWorld(true)
    camera.updateMatrixWorld(true)
    camera.getWorldPosition(eye)
    const previousTarget = gl.getRenderTarget()
    const shadowAutoUpdate = gl.shadowMap.autoUpdate
    const xrEnabled = gl.xr.enabled
    const visibility = rigs.map(rig => rig.surface.visible)
    try {
      gl.xr.enabled = false
      gl.shadowMap.autoUpdate = false
      // Suppress recursive mirror images only. The car, occupants and housings
      // remain occluders (hiding the whole cockpit would make a false reflection).
      for (const rig of rigs) rig.surface.visible = false
      for (const rig of rigs) {
        if (!rig.projection.update(rig.surface.matrixWorld, eye, rig.spec.width, rig.spec.height)) continue
        gl.setRenderTarget(rig.target)
        gl.clear()
        gl.render(scene, rig.projection.camera)
      }
    } finally {
      gl.setRenderTarget(previousTarget)
      gl.shadowMap.autoUpdate = shadowAutoUpdate
      gl.xr.enabled = xrEnabled
      rigs.forEach((rig, i) => { rig.surface.visible = visibility[i] })
    }
    gl.render(scene, camera)
  }, 1)

  return <group name="vehicle-mirrors">
    {rigs.map(({ spec, surface, housing }) => <group key={spec.id}>
      {/* Mounts are attached to the car; only the glass/housing has adjustment. */}
      {spec.id === 'center'
        ? <mesh position={[-0.06, 1.56, -0.64]} rotation-x={-0.3}><boxGeometry args={[0.024, 0.15, 0.027]} /><meshStandardMaterial color="#252a2b" roughness={0.65} /></mesh>
        : <mesh position={[Math.sign(spec.position.x) * 0.93, 1.105, -0.84]}><boxGeometry args={[0.21, 0.045, 0.075]} /><meshStandardMaterial color="#252a2b" roughness={0.65} /></mesh>}
      <group position={spec.position} quaternion={spec.quaternion}>
        <mesh geometry={housing} position-z={spec.id === 'center' ? -0.015 : -0.035}>
          <meshStandardMaterial color="#202729" roughness={0.48} metalness={0.12} />
        </mesh>
        <primitive object={surface} />
      </group>
    </group>)}
  </group>
}

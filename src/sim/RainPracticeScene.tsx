import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RAIN_PUDDLES, rainPuddlesNear } from './rainPuddles'
import type { RainWaterState } from './rainWater'

const DROP_COUNT = 176
const RAIN_HEIGHT_METERS = 9
const MAX_PUDDLES = (RAIN_PUDDLES.visibleCellRadius * 2 + 1) ** 2

function fraction(value: number): number {
  return value - Math.floor(value)
}

function seeded(index: number, salt: number): number {
  return fraction(Math.sin(index * 127.1 + salt * 311.7) * 43758.5453)
}

/**
 * Rain is a bounded, draw-call-light visual. It follows the observer but
 * cannot move the vehicle or change the physics weather/score state.
 * The authoritative accumulation clock stays inside stepVehiclePhysics.
 */
export function RainPracticeScene({
  vehicle,
  rainWater,
}: {
  vehicle: { current: { x: number; z: number } }
  rainWater: { current: RainWaterState }
}) {
  const frame = useRef<THREE.Group>(null)
  const elapsed = useRef(0)
  const waterSurfaces = useRef<THREE.InstancedMesh>(null)
  const instance = useMemo(() => new THREE.Object3D(), [])
  const shallowColor = useMemo(() => new THREE.Color('#668d9c'), [])
  const deepColor = useMemo(() => new THREE.Color('#b2ced8'), [])
  const tint = useMemo(() => new THREE.Color(), [])
  const geometry = useMemo(() => {
    const buffer = new Float32Array(DROP_COUNT * 6)
    const attribute = new THREE.BufferAttribute(buffer, 3)
    attribute.setUsage(THREE.DynamicDrawUsage)
    const result = new THREE.BufferGeometry()
    result.setAttribute('position', attribute)
    return result
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame((_, dt) => {
    elapsed.current += Math.min(0.05, Math.max(0, dt))
    if (frame.current) frame.current.position.set(vehicle.current.x, 0, vehicle.current.z)
    const positions = (geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
    for (let index = 0; index < DROP_COUNT; index += 1) {
      const seedX = seeded(index + 1, 1)
      const seedZ = seeded(index + 1, 2)
      const seedY = seeded(index + 1, 3)
      const speed = 10 + seeded(index + 1, 4) * 7
      const x = (seedX - 0.5) * 32
      const z = (seedZ - 0.5) * 32
      const y = 0.25 + fraction(seedY - elapsed.current * speed / RAIN_HEIGHT_METERS) *
        RAIN_HEIGHT_METERS
      const start = index * 6
      positions[start] = x
      positions[start + 1] = y
      positions[start + 2] = z
      positions[start + 3] = x + 0.10
      positions[start + 4] = y + 0.36
      positions[start + 5] = z + 0.05
    }
    ;(geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true

    // Decals remain fixed to the actual world grid while the rain follows
    // the observer. Sample the EXACT local depth field used by tire physics.
    const mesh = waterSurfaces.current
    if (!mesh) return
    const samples = rainPuddlesNear(
      rainWater.current, vehicle.current.x, vehicle.current.z,
    )
    for (let i = 0; i < MAX_PUDDLES; i += 1) {
      const sample = samples[i]
      instance.position.set(sample?.x ?? 0, 0.018, sample?.z ?? 0)
      instance.rotation.set(-Math.PI / 2, 0, 0)
      instance.scale.set(
        sample?.radiusX ?? 0,
        sample?.radiusZ ?? 0,
        1,
      )
      instance.updateMatrix()
      mesh.setMatrixAt(i, instance.matrix)
      tint.copy(shallowColor).lerp(deepColor, sample?.intensity ?? 0)
      mesh.setColorAt(i, tint)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return <>
  <group ref={frame}>
    <lineSegments geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial color="#a9cce3" opacity={0.52} transparent depthWrite={false} />
    </lineSegments>
  </group>
  <instancedMesh
      ref={waterSurfaces}
      args={[undefined, undefined, MAX_PUDDLES]}
      frustumCulled={false}
      name="world-anchored-rain-puddles"
    >
      <circleGeometry args={[1, 28]} />
      <meshBasicMaterial
        color="#d1e5f0"
        transparent
        opacity={0.22}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  </>
}

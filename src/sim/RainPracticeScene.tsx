import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  RAIN_PUDDLES,
  rainPuddleSamplingKey,
  rainPuddlesNear,
} from './rainPuddles'
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
 * Streaks follow the driver, but are seeded only at mount. Puddles stay fixed
 * to the world grid and use the same depth source as the tire solver.
 * Rendering never advances the physical rain clock.
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
  const previousPuddleKey = useRef<string | null>(null)
  const puddleRefreshes = useRef(0)
  const drawnPuddles = useRef(0)
  const diagnosticsEnabled = useMemo(
    () => typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('renderDiagnostics') === '1',
    [],
  )
  const instance = useMemo(() => new THREE.Object3D(), [])
  const shallowColor = useMemo(() => new THREE.Color('#586f79'), [])
  const deepColor = useMemo(() => new THREE.Color('#9bb5c0'), [])
  const tint = useMemo(() => new THREE.Color(), [])
  const streaks = useMemo(() => Array.from({ length: DROP_COUNT }, (_, i) => {
    const index = i + 1
    return {
      x: (seeded(index, 1) - 0.5) * 32,
      z: (seeded(index, 2) - 0.5) * 32,
      initialHeight: seeded(index, 3),
      speed: 10 + seeded(index, 4) * 7,
    }
  }), [])
  const geometry = useMemo(() => {
    const positions = new Float32Array(DROP_COUNT * 6)
    for (let i = 0; i < streaks.length; i += 1) {
      const start = i * 6
      positions[start] = streaks[i].x
      positions[start + 2] = streaks[i].z
      positions[start + 3] = streaks[i].x + 0.10
      positions[start + 5] = streaks[i].z + 0.05
    }
    const attribute = new THREE.BufferAttribute(positions, 3)
    attribute.setUsage(THREE.DynamicDrawUsage)
    const result = new THREE.BufferGeometry()
    result.setAttribute('position', attribute)
    return result
  }, [streaks])

  useEffect(() => {
    waterSurfaces.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    return () => {
      geometry.dispose()
      if (diagnosticsEnabled) {
        delete (window as Window & { __subject2RainScene?: object }).__subject2RainScene
      }
    }
  }, [geometry, diagnosticsEnabled])

  useFrame((_, dt) => {
    elapsed.current += Math.min(0.05, Math.max(0, Number.isFinite(dt) ? dt : 0))
    if (frame.current) frame.current.position.set(vehicle.current.x, 0, vehicle.current.z)

    const attribute = geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = attribute.array as Float32Array
    for (let index = 0; index < DROP_COUNT; index += 1) {
      const drop = streaks[index]
      const y = 0.25 + fraction(drop.initialHeight -
        elapsed.current * drop.speed / RAIN_HEIGHT_METERS) * RAIN_HEIGHT_METERS
      const start = index * 6
      positions[start + 1] = y
      positions[start + 4] = y + 0.36
    }
    attribute.needsUpdate = true

    const mesh = waterSurfaces.current
    if (!mesh) return
    const key = rainPuddleSamplingKey(
      rainWater.current, vehicle.current.x, vehicle.current.z,
    )
    if (key !== previousPuddleKey.current) {
      previousPuddleKey.current = key
      const samples = rainPuddlesNear(
        rainWater.current, vehicle.current.x, vehicle.current.z,
      )
      drawnPuddles.current = samples.length
      puddleRefreshes.current += 1
      for (let i = 0; i < MAX_PUDDLES; i += 1) {
        const sample = samples[i]
        instance.position.set(sample?.x ?? 0, 0.018, sample?.z ?? 0)
        instance.rotation.set(-Math.PI / 2, 0, 0)
        instance.scale.set(sample?.radiusX ?? 0, sample?.radiusZ ?? 0, 1)
        instance.updateMatrix()
        mesh.setMatrixAt(i, instance.matrix)
        tint.copy(shallowColor).lerp(deepColor, sample?.intensity ?? 0)
        mesh.setColorAt(i, tint)
      }
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }

    if (diagnosticsEnabled) {
      (window as Window & { __subject2RainScene?: object }).__subject2RainScene = {
        puddleRefreshes: puddleRefreshes.current,
        visiblePuddles: drawnPuddles.current,
        maxPuddles: MAX_PUDDLES,
        rainStreaks: DROP_COUNT,
      }
    }
  })

  return <>
    <group ref={frame}>
      <lineSegments geometry={geometry} frustumCulled={false}>
        <lineBasicMaterial color="#a9cce3" opacity={0.52}
          transparent depthWrite={false} />
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
        color="#e5edf0"
        transparent
        opacity={0.28}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  </>
}

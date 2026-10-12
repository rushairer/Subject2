import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { wheelContactFootprints, type WheelId } from './wheelContact'
import { localRainWaterDepthMm, type RainWaterState } from './rainWater'
import {
  RAIN_TIRE_SPRAY,
  rainTireSprayEmissionRate,
  rainTireSprayVelocity,
} from './rainTireSpray'

interface RainSprayVehicle {
  x: number
  z: number
  heading: number
  steering: number
  speed: number
}

interface SprayParticle {
  active: boolean
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  age: number
  phase: number
}

const PARTICLE_CAPACITY = RAIN_TIRE_SPRAY.capacity
const WHEEL_IDS: readonly WheelId[] = [
  'front-left', 'front-right', 'rear-left', 'rear-right',
]
const newParticles = (): SprayParticle[] => Array.from(
  { length: PARTICLE_CAPACITY },
  (_, i) => ({
    active: false,
    x: 0, y: -100, z: 0,
    vx: 0, vy: 0, vz: 0,
    age: 0,
    phase: (i + 1) * 1.61803398875,
  }),
)

/**
 * Rain-only, world-space particle pool. No procedural wheel shortcuts,
 * second water map, allocations per particle frame, or physics mutations.
 * Its single InstancedMesh stays empty when parked.
 */
export function RainTireSpray({
  vehicle,
  rainWater,
}: {
  vehicle: MutableRefObject<RainSprayVehicle>
  rainWater: MutableRefObject<RainWaterState>
}) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const particles = useRef(newParticles())
  const cursor = useRef(0)
  const emittedTotal = useRef(0)
  const activeCount = useRef(0)
  const emission = useRef<Record<WheelId, number>>({
    'front-left': 0, 'front-right': 0, 'rear-left': 0, 'rear-right': 0,
  })
  const matrix = useRef(new THREE.Matrix4())
  const position = useRef(new THREE.Vector3())
  const quaternion = useRef(new THREE.Quaternion())
  const scale = useRef(new THREE.Vector3())
  const diagnosticEnabled = useRef(
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('renderDiagnostics') === '1',
  )

  useEffect(() => {
    if (mesh.current) mesh.current.count = 0
    return () => {
      if (diagnosticEnabled.current) {
        delete (window as Window & { __subject2RainSpray?: object }).__subject2RainSpray
      }
    }
  }, [])

  useFrame((_, rawDt) => {
    const instanced = mesh.current
    if (!instanced) return
    const dt = Number.isFinite(rawDt) ? Math.max(0, Math.min(rawDt, 0.05)) : 0
    const car = vehicle.current
    let emitting = false

    if (dt > 0 && Number.isFinite(car.speed) &&
        Math.abs(car.speed) > RAIN_TIRE_SPRAY.minSpeedMps) {
      const wheels = wheelContactFootprints(car)
      for (const wheel of wheels) {
        const depth = localRainWaterDepthMm(
          rainWater.current, wheel.center.x, wheel.center.z,
        )
        const rate = rainTireSprayEmissionRate(car.speed, depth)
        if (rate <= 0) {
          emission.current[wheel.id] = 0
          continue
        }
        emitting = true
        emission.current[wheel.id] = (emission.current[wheel.id] ?? 0) + rate * dt
        while ((emission.current[wheel.id] ?? 0) >= 1) {
          emission.current[wheel.id] = (emission.current[wheel.id] ?? 0) - 1
          const particle = particles.current[cursor.current]
          cursor.current = (cursor.current + 1) % PARTICLE_CAPACITY
          emittedTotal.current += 1
          const phase = particle.phase + emittedTotal.current * 0.37
          const velocity = rainTireSprayVelocity(
            wheel.heading, car.speed, depth, phase,
          )
          particle.active = true
          particle.x = wheel.center.x
          particle.y = 0.11
          particle.z = wheel.center.z
          particle.vx = velocity.vx
          particle.vy = velocity.vy
          particle.vz = velocity.vz
          particle.age = 0
        }
      }
    } else {
      for (const wheelId of WHEEL_IDS) emission.current[wheelId] = 0
    }

    if (!emitting && activeCount.current === 0) {
      instanced.count = 0
      if (diagnosticEnabled.current) {
        (window as Window & { __subject2RainSpray?: object }).__subject2RainSpray = {
          capacity: PARTICLE_CAPACITY,
          activeParticles: 0,
          emittedTotal: emittedTotal.current,
          emitting: false,
        }
      }
      return
    }

    let visible = 0
    for (let i = 0; i < PARTICLE_CAPACITY; i += 1) {
      const p = particles.current[i]
      if (p.active) {
        p.age += dt
        p.vy -= RAIN_TIRE_SPRAY.gravityMps2 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.z += p.vz * dt
        const drag = Math.exp(-1.35 * dt)
        p.vx *= drag
        p.vz *= drag
        if (p.y <= RAIN_TIRE_SPRAY.minDropletY || p.age > 0.8) {
          p.active = false
        }
      }
      if (p.active) {
        visible += 1
        position.current.set(p.x, p.y, p.z)
        const radius = 0.021 + Math.min(0.025, p.age * 0.06)
        scale.current.set(radius, radius * 0.75, radius)
      } else {
        position.current.set(0, -100, 0)
        scale.current.setScalar(0.001)
      }
      matrix.current.compose(
        position.current, quaternion.current, scale.current,
      )
      instanced.setMatrixAt(i, matrix.current)
    }
    activeCount.current = visible
    instanced.count = visible ? PARTICLE_CAPACITY : 0
    if (visible) instanced.instanceMatrix.needsUpdate = true

    if (diagnosticEnabled.current) {
      (window as Window & { __subject2RainSpray?: object }).__subject2RainSpray = {
        capacity: PARTICLE_CAPACITY,
        activeParticles: visible,
        emittedTotal: emittedTotal.current,
        emitting,
      }
    }
  })

  return <instancedMesh
    ref={mesh}
    args={[undefined, undefined, PARTICLE_CAPACITY]}
    frustumCulled={false}
    renderOrder={3}
    name="rain-wheel-water-spray"
  >
    <sphereGeometry args={[1, 5, 4]} />
    <meshBasicMaterial color="#b9d6e1" transparent opacity={0.42}
      depthWrite={false} />
  </instancedMesh>
}

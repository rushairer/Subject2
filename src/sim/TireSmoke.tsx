import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { forwardFromHeading, rightFromHeading } from './vehicleFrame'
import { wheelContactFootprints, type WheelId } from './wheelContact'
import { tireSmokeEmissionRate } from './tireEffects'
import type { TireTelemetry } from './vehicleTireDynamics'

const PARTICLE_CAPACITY = 96

interface TireSmokeVehicle {
  x: number
  z: number
  heading: number
  steering: number
  speed: number
}

interface SmokeParticle {
  active: boolean
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  age: number
  lifetime: number
  phase: number
}

const makeParticles = () =>
  Array.from({ length: PARTICLE_CAPACITY }, (_, index): SmokeParticle => ({
    active: false,
    x: 0,
    y: -10,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    age: 0,
    lifetime: 1,
    phase: index * 1.61803398875,
  }))

export function TireSmoke({
  vehicle,
  telemetry,
}: {
  vehicle: MutableRefObject<TireSmokeVehicle>
  telemetry: MutableRefObject<TireTelemetry | null>
}) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const particles = useRef(makeParticles())
  const spawnCursor = useRef(0)
  const emission = useRef<Partial<Record<WheelId, number>>>({})
  const matrix = useRef(new THREE.Matrix4())
  const position = useRef(new THREE.Vector3())
  const quaternion = useRef(new THREE.Quaternion())
  const scale = useRef(new THREE.Vector3())

  useEffect(() => {
    if (mesh.current) mesh.current.count = 0
  }, [])

  useFrame((_, rawDt) => {
    const instanced = mesh.current
    const tire = telemetry.current
    if (!instanced || !tire) return

    const dt = Math.min(rawDt, 0.05)
    const car = vehicle.current
    const forward = forwardFromHeading(car.heading)
    const right = rightFromHeading(car.heading)

    for (const wheel of wheelContactFootprints(car)) {
      const rate = tireSmokeEmissionRate(tire, car.speed, wheel.id)
      emission.current[wheel.id] = (emission.current[wheel.id] ?? 0) + rate * dt

      while ((emission.current[wheel.id] ?? 0) >= 1) {
        emission.current[wheel.id] = (emission.current[wheel.id] ?? 0) - 1
        const particle = particles.current[spawnCursor.current]
        spawnCursor.current = (spawnCursor.current + 1) % PARTICLE_CAPACITY
        const phase = particle.phase + spawnCursor.current * 0.37
        particle.active = true
        particle.x = wheel.center.x
        particle.y = 0.11
        particle.z = wheel.center.z
        // The plume trails the car and spreads sideways deterministically.
        const lateral = Math.sin(phase) * 0.18
        particle.vx =
          -forward.x * Math.abs(car.speed) * 0.035 +
          right.x * lateral
        particle.vz =
          -forward.z * Math.abs(car.speed) * 0.035 +
          right.z * lateral
        particle.vy = 0.25 + 0.08 * (0.5 + 0.5 * Math.cos(phase))
        particle.age = 0
        particle.lifetime = 0.75 + 0.25 * (0.5 + 0.5 * Math.sin(phase * 1.7))
      }
    }

    for (let index = 0; index < PARTICLE_CAPACITY; index += 1) {
      const particle = particles.current[index]
      if (!particle.active) {
        position.current.set(0, -10, 0)
        scale.current.setScalar(0.001)
      } else {
        particle.age += dt
        if (particle.age >= particle.lifetime) {
          particle.active = false
          position.current.set(0, -10, 0)
          scale.current.setScalar(0.001)
        } else {
          particle.x += particle.vx * dt
          particle.y += particle.vy * dt
          particle.z += particle.vz * dt
          particle.vx *= Math.exp(-1.2 * dt)
          particle.vz *= Math.exp(-1.2 * dt)
          const progress = particle.age / particle.lifetime
          const radius = 0.09 + progress * 0.28
          position.current.set(particle.x, particle.y, particle.z)
          scale.current.setScalar(radius)
        }
      }

      matrix.current.compose(
        position.current,
        quaternion.current,
        scale.current,
      )
      instanced.setMatrixAt(index, matrix.current)
    }
    instanced.count = PARTICLE_CAPACITY
    instanced.instanceMatrix.needsUpdate = true
  }, 1)

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, PARTICLE_CAPACITY]}
      frustumCulled={false}
      renderOrder={3}
    >
      <sphereGeometry args={[1, 8, 6]} />
      <meshBasicMaterial
        color="#b8b8b4"
        transparent
        opacity={0.18}
        depthWrite={false}
      />
    </instancedMesh>
  )
}

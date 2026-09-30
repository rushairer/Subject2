import { useFrame } from '@react-three/fiber'
import { useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { TRAINING_CAR } from './vehicleDimensions'
import { wheelContactFootprints, type WheelId } from './wheelContact'
import { TIRE_EFFECT_THRESHOLDS, wheelSkidSeverity } from './tireEffects'
import type { TireTelemetry } from './vehicleTireDynamics'

const MARK_CAPACITY = 1400
const MIN_SEGMENT_METERS = 0.10
const MAX_SEGMENT_METERS = 0.65

interface TireMarkVehicle {
  x: number
  z: number
  heading: number
  steering: number
  speed: number
}

interface MarkPoint {
  x: number
  z: number
}


/**
 * Persistent road-space tire marks driven exclusively by shared tire telemetry.
 * The mesh pool is bounded so a long Subject 3 session cannot grow GPU objects.
 */
export function TireSkidMarks({
  vehicle,
  telemetry,
}: {
  vehicle: MutableRefObject<TireMarkVehicle>
  telemetry: MutableRefObject<TireTelemetry | null>
}) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const cursor = useRef(0)
  const written = useRef(0)
  const previous = useRef<Partial<Record<WheelId, MarkPoint>>>({})
  const matrix = useRef(new THREE.Matrix4())
  const position = useRef(new THREE.Vector3())
  const quaternion = useRef(new THREE.Quaternion())
  const scale = useRef(new THREE.Vector3())
  const euler = useRef(new THREE.Euler())

  useFrame(() => {
    const instanced = mesh.current
    const tire = telemetry.current
    if (!instanced || !tire) return

    const car = vehicle.current
    const speed = Math.abs(car.speed)
    for (const wheel of wheelContactFootprints(car)) {
      const severity = wheelSkidSeverity(tire, wheel.id)
      const current = wheel.center
      const prior = previous.current[wheel.id]

      if (
        speed < TIRE_EFFECT_THRESHOLDS.markMinimumSpeedMps ||
        severity < TIRE_EFFECT_THRESHOLDS.markMinimumSeverity
      ) {
        previous.current[wheel.id] = undefined
        continue
      }

      if (!prior) {
        previous.current[wheel.id] = { ...current }
        continue
      }

      const dx = current.x - prior.x
      const dz = current.z - prior.z
      const distance = Math.hypot(dx, dz)
      if (distance < MIN_SEGMENT_METERS) continue

      // Teleports/collision correction should not draw a long black bridge.
      if (distance > MAX_SEGMENT_METERS * 2.2) {
        previous.current[wheel.id] = { ...current }
        continue
      }

      position.current.set(
        (prior.x + current.x) / 2,
        0.014,
        (prior.z + current.z) / 2,
      )
      euler.current.set(0, Math.atan2(dx, dz), 0)
      quaternion.current.setFromEuler(euler.current)
      scale.current.set(
        TRAINING_CAR.tireWidthMeters * (0.46 + severity * 0.28),
        0.003,
        Math.min(distance, MAX_SEGMENT_METERS),
      )
      matrix.current.compose(
        position.current,
        quaternion.current,
        scale.current,
      )

      instanced.setMatrixAt(cursor.current, matrix.current)
      cursor.current = (cursor.current + 1) % MARK_CAPACITY
      written.current += 1
      instanced.count = Math.min(MARK_CAPACITY, written.current)
      instanced.instanceMatrix.needsUpdate = true
      previous.current[wheel.id] = { ...current }
    }
  }, 1)

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, MARK_CAPACITY]}
      frustumCulled={false}
      renderOrder={2}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial
        color="#171717"
        transparent
        opacity={0.42}
        depthWrite={false}
      />
    </instancedMesh>
  )
}

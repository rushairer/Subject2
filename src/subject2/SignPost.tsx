import { useRef, type MutableRefObject, type ReactElement } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Vehicle } from '../sim/vehicleCollision'
import {
  checkVehicleCircleCollision,
  resolveRigidCircleObstacle,
} from '../sim/vehicleCollision'
import { playCollisionImpact, type VehicleAudioState } from '../audio/vehicleAudio'
import {
  localPoseToWorld,
  worldPoseToLocal,
  type CoursePlacement,
} from './courseTransform'

export interface SignPostProps {
  x: number
  z: number
  vehicle?: MutableRefObject<Vehicle>
  placement?: CoursePlacement
  audioContext?: AudioContext | null
  audioState?: VehicleAudioState
  signText?: string
}

const POLE_COLLISION_RADIUS = 0.16

export function SignPost({
  x,
  z,
  vehicle,
  placement,
  audioContext,
  audioState,
}: SignPostProps): ReactElement {
  const groupRef = useRef<THREE.Group>(null)

  // Spring wobble animation on impact
  const wobbleAmp = useRef(0)
  const wobbleTime = useRef(0)
  const wobbleDir = useRef<[number, number]>([1, 0])

  useFrame((_, dt) => {
    if (!groupRef.current) return
    const v = vehicle?.current
    if (!v) return

    // Transform vehicle to local coordinate frame
    const localVehicle = placement
      ? { ...worldPoseToLocal(v, placement), speed: v.speed }
      : { ...v }

    const outcome = resolveRigidCircleObstacle(
      localVehicle,
      { x, z, radius: POLE_COLLISION_RADIUS },
    )

    if (outcome.collided) {
      // Map updated local vehicle position back to world frame
      if (placement) {
        const worldPos = localPoseToWorld(localVehicle, placement)
        v.x = worldPos.x
        v.z = worldPos.z
      } else {
        v.x = localVehicle.x
        v.z = localVehicle.z
      }
      v.speed = 0

      // Trigger metallic impact sound
      playCollisionImpact(audioContext ?? null, outcome.impactSpeed, audioState)

      // Start post wobble
      wobbleAmp.current = Math.min(0.14, Math.max(0.04, outcome.impactSpeed * 0.05))
      wobbleTime.current = 0
      const collision = checkVehicleCircleCollision(localVehicle, { x, z, radius: POLE_COLLISION_RADIUS })
      wobbleDir.current = [collision.normal.x, collision.normal.z]
    }

    // Animate wobble decay
    if (wobbleAmp.current > 0.001) {
      wobbleTime.current += dt
      wobbleAmp.current *= Math.exp(-dt * 6)
      const angle = Math.sin(wobbleTime.current * 30) * wobbleAmp.current
      groupRef.current.rotation.x = wobbleDir.current[1] * angle
      groupRef.current.rotation.z = -wobbleDir.current[0] * angle
    } else {
      groupRef.current.rotation.x = 0
      groupRef.current.rotation.z = 0
    }
  })

  return (
    <group ref={groupRef} position={[x, 0, z]}>
      {/* Support pole mounted behind sign plate */}
      <mesh position={[0.08, 1.4, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 2.8, 12]} />
        <meshStandardMaterial color="#777" metalness={0.7} roughness={0.35} />
      </mesh>
      {/* Upper and lower mounting brackets connecting pole to plate back */}
      <mesh position={[0.04, 2.75, 0]} castShadow>
        <boxGeometry args={[0.09, 0.05, 0.4]} />
        <meshStandardMaterial color="#555" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0.04, 2.35, 0]} castShadow>
        <boxGeometry args={[0.09, 0.05, 0.4]} />
        <meshStandardMaterial color="#555" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Sign plate (front face clean and unpenetrated) */}
      <mesh position={[0, 2.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.04, 0.8, 1.55]} />
        <meshStandardMaterial color="#176aa7" roughness={0.4} />
      </mesh>
    </group>
  )
}

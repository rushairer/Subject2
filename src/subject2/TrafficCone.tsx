import { useEffect, useRef, type MutableRefObject, type ReactElement } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Vehicle } from '../sim/vehicleCollision'
import {
  calculateConeImpact,
  checkVehicleCircleCollision,
} from '../sim/vehicleCollision'
import { playConeImpact, type VehicleAudioState } from '../audio/vehicleAudio'
import { worldPoseToLocal, type CoursePlacement } from './courseTransform'

export interface TrafficConeProps {
  x: number
  z: number
  vehicle?: MutableRefObject<Vehicle>
  placement?: CoursePlacement
  audioContext?: AudioContext | null
  audioState?: VehicleAudioState
  color?: string
}

const CONE_COLLISION_RADIUS = 0.18

export function TrafficCone({
  x,
  z,
  vehicle,
  placement,
  audioContext,
  audioState,
  color = '#df6a31',
}: TrafficConeProps): ReactElement {
  const groupRef = useRef<THREE.Group>(null)

  // Simulation state
  const pos = useRef<{ x: number; z: number }>({ x, z })
  const initialPos = useRef<{ x: number; z: number }>({ x, z })
  const knocked = useRef(false)
  const knockAngle = useRef(0)
  const knockAxis = useRef<[number, number, number]>([1, 0, 0])
  const slideSpeed = useRef(0)
  const slideDir = useRef<[number, number]>([0, 0])
  const tempVec = useRef(new THREE.Vector3())
  const tempQuat = useRef(new THREE.Quaternion())

  // Reset to initial position if coordinates prop changes
  useEffect(() => {
    pos.current = { x, z }
    initialPos.current = { x, z }
    knocked.current = false
    knockAngle.current = 0
    slideSpeed.current = 0
  }, [x, z])

  useFrame((_, dt) => {
    if (!groupRef.current) return
    const v = vehicle?.current
    if (!v) return

    // Transform vehicle to local coordinate frame if course has placement
    const localVehicle = placement ? worldPoseToLocal(v, placement) : v

    // Check collision with upright cone
    if (!knocked.current) {
      const collision = checkVehicleCircleCollision(
        localVehicle,
        { x: pos.current.x, z: pos.current.z, radius: CONE_COLLISION_RADIUS },
      )

      if (collision.colliding) {
        const impact = calculateConeImpact(
          { ...localVehicle, speed: v.speed },
          { x: pos.current.x, z: pos.current.z, radius: CONE_COLLISION_RADIUS },
          collision,
        )

        knocked.current = true
        knockAxis.current = impact.knockAxis
        slideDir.current = impact.slideDir
        slideSpeed.current = impact.initialSlideSpeed

        // Play realistic hollow plastic cone knock-down sound
        playConeImpact(audioContext ?? null, v.speed, audioState)

        // Kinetic drag on vehicle: slight speed reduction on impact
        v.speed *= 0.88
      }
    } else {
      // Animate knockdown tilt over ~0.15s
      if (knockAngle.current < 1.45) {
        knockAngle.current = Math.min(1.45, knockAngle.current + dt * 10)
      }

      // Slide and friction deceleration
      if (slideSpeed.current > 0.01) {
        slideSpeed.current = Math.max(0, slideSpeed.current - dt * 4.2)
        pos.current.x += slideDir.current[0] * slideSpeed.current * dt
        pos.current.z += slideDir.current[1] * slideSpeed.current * dt
      }

      // If vehicle continues driving over/against the knocked cone, push it along
      const recheck = checkVehicleCircleCollision(
        localVehicle,
        { x: pos.current.x, z: pos.current.z, radius: CONE_COLLISION_RADIUS + 0.05 },
      )
      if (recheck.colliding && Math.abs(v.speed) > 0.02) {
        const pushDistance = Math.abs(v.speed) * dt
        pos.current.x += recheck.normal.x * pushDistance
        pos.current.z += recheck.normal.z * pushDistance
      }
    }

    // Apply position and rotation to Three.js group
    const yOffset = knocked.current ? Math.sin(knockAngle.current) * 0.03 : 0
    groupRef.current.position.set(pos.current.x, yOffset, pos.current.z)

    if (knocked.current) {
      tempVec.current.set(knockAxis.current[0], knockAxis.current[1], knockAxis.current[2]).normalize()
      tempQuat.current.setFromAxisAngle(tempVec.current, knockAngle.current)
      groupRef.current.quaternion.copy(tempQuat.current)
    } else {
      groupRef.current.quaternion.identity()
    }
  })

  return (
    <group ref={groupRef} position={[x, 0, z]}>
      {/* Heavy rubber square base plate */}
      <mesh position={[0, 0.015, 0]}>
        <boxGeometry args={[0.34, 0.03, 0.34]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
      </mesh>
      {/* Tapered orange cone body */}
      <mesh position={[0, 0.23, 0]}>
        <cylinderGeometry args={[0.045, 0.15, 0.44, 16]} />
        <meshStandardMaterial color={color} roughness={0.45} />
      </mesh>
      {/* White reflective collar sleeve */}
      <mesh position={[0, 0.26, 0]}>
        <cylinderGeometry args={[0.075, 0.098, 0.10, 16]} />
        <meshStandardMaterial color="#f4f4f4" roughness={0.25} metalness={0.15} />
      </mesh>
    </group>
  )
}

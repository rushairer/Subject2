import type { MutableRefObject, ReactElement } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Vehicle } from '../sim/vehicleCollision'
import type { VehicleAudioState } from '../audio/vehicleAudio'
import { useCollisionBody } from '../sim/useCollisionBody'
import {
  localPoseToWorld,
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

const SIGN_POST_GEOMETRY = {
  poleOffsetX: 0.08,
  poleRadius: 0.07,
  poleTopRadius: 0.05,
  poleHeight: 2.8,
} as const

export function SignPost({
  x,
  z,
  vehicle,
  placement,
  audioContext,
  audioState,
}: SignPostProps): ReactElement {
  const body = useCollisionBody({ kind: 'pole', player: vehicle, audioContext, audioState })
  const localPole = { x: x + SIGN_POST_GEOMETRY.poleOffsetX, z, heading: 0 }
  const worldPole = placement ? localPoseToWorld(localPole, placement) : localPole
  useFrame((_, dt) => {
    body.step(dt)
    body.circle({ x: worldPole.x, z: worldPole.z, radius: SIGN_POST_GEOMETRY.poleRadius })
    body.animate(worldPole.heading)
  }, -1)

  return (
    <group position={[localPole.x, 0, localPole.z]}>
      <group ref={body.visual}>
        {/* Wobble pivots around the same fixed post base used by collision. */}
        <mesh position-y={SIGN_POST_GEOMETRY.poleHeight / 2} castShadow>
          <cylinderGeometry args={[SIGN_POST_GEOMETRY.poleTopRadius, SIGN_POST_GEOMETRY.poleRadius, SIGN_POST_GEOMETRY.poleHeight, 12]} />
          <meshStandardMaterial color="#777" metalness={0.7} roughness={0.35} />
        </mesh>
        {/* Upper and lower mounting brackets connecting pole to plate back */}
        <mesh position={[0.04 - SIGN_POST_GEOMETRY.poleOffsetX, 2.75, 0]} castShadow>
          <boxGeometry args={[0.09, 0.05, 0.4]} />
          <meshStandardMaterial color="#555" metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh position={[0.04 - SIGN_POST_GEOMETRY.poleOffsetX, 2.35, 0]} castShadow>
          <boxGeometry args={[0.09, 0.05, 0.4]} />
          <meshStandardMaterial color="#555" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Sign plate stays above the training-car roof. */}
        <mesh position={[-SIGN_POST_GEOMETRY.poleOffsetX, 2.55, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.04, 0.8, 1.55]} />
          <meshStandardMaterial color="#176aa7" roughness={0.4} />
        </mesh>
      </group>
    </group>
  )
}

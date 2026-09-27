import { useEffect, useRef, type MutableRefObject, type ReactElement } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Vehicle } from '../sim/vehicleCollision'
import { createCollisionMotion } from '../sim/collisionResponse'
import { useCollisionBody } from '../sim/useCollisionBody'
import type { VehicleAudioState } from '../audio/vehicleAudio'
import { localPoseToWorld, worldPoseToLocal, type CoursePlacement } from './courseTransform'
import { TRAFFIC_CONE, trafficConeContactCircles, trafficConeGroundLift } from '../sim/trafficConeGeometry'

export interface TrafficConeProps {
  x: number
  z: number
  vehicle?: MutableRefObject<Vehicle>
  placement?: CoursePlacement
  audioContext?: AudioContext | null
  audioState?: VehicleAudioState
  color?: string
  onImpact?: () => void
}

export function TrafficCone({
  x,
  z,
  vehicle,
  placement,
  audioContext,
  audioState,
  color = '#df6a31',
  onImpact,
}: TrafficConeProps): ReactElement {
  const groupRef = useRef<THREE.Group>(null)
  const collision = useCollisionBody({
    kind: 'cone',
    player: vehicle,
    audioContext,
    audioState,
    onImpact: onImpact ? () => onImpact() : undefined,
  })
  const baseWorld = placement ? localPoseToWorld({ x, z, heading: 0 }, placement) : { x, z, heading: 0 }

  useEffect(() => {
    collision.motion.current = createCollisionMotion()
  }, [x, z, placement?.x, placement?.z, placement?.heading, collision.motion])

  useFrame((_, dt) => {
    if (!groupRef.current) return
    collision.step(Math.min(dt, 0.05))
    const motion = collision.motion.current
    const world = { ...baseWorld, x: baseWorld.x + motion.offsetX, z: baseWorld.z + motion.offsetZ }
    const pose = collision.animate(baseWorld.heading)
    collision.circles(trafficConeContactCircles(world, pose), { x: motion.velocityX, z: motion.velocityZ })
    const displayedPose = collision.animate(baseWorld.heading)
    const local = placement ? worldPoseToLocal(world, placement) : world
    groupRef.current.position.set(local.x, trafficConeGroundLift(displayedPose), local.z)
  }, -1)

  return (
    <group ref={groupRef} position={[x, 0, z]}>
      <group ref={collision.visual}>
        {/* Heavy rubber square base plate */}
        <mesh position={[0, TRAFFIC_CONE.baseHeight / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[TRAFFIC_CONE.baseWidth, TRAFFIC_CONE.baseHeight, TRAFFIC_CONE.baseWidth]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
        </mesh>
        {/* Tapered orange cone body */}
        <mesh position={[0, TRAFFIC_CONE.bodyCenterHeight, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[TRAFFIC_CONE.bodyTopRadius, TRAFFIC_CONE.bodyBottomRadius, TRAFFIC_CONE.bodyHeight, 16]} />
          <meshStandardMaterial color={color} roughness={0.45} />
        </mesh>
        {/* White reflective collar sleeve */}
        <mesh position={[0, TRAFFIC_CONE.collarCenterHeight, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[TRAFFIC_CONE.collarTopRadius, TRAFFIC_CONE.collarBottomRadius, TRAFFIC_CONE.collarHeight, 16]} />
          <meshStandardMaterial color="#f4f4f4" roughness={0.25} metalness={0.15} />
        </mesh>
      </group>
    </group>
  )
}

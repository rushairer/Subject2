import { useRef, type MutableRefObject } from 'react'
import type { Group } from 'three'
import { playCollisionImpact, type VehicleAudioState } from '../audio/vehicleAudio'
import {
  applyCollisionMotion,
  collisionMotionPose,
  createCollisionMotion,
  resolveCircleImpact,
  resolveCircleCompoundImpact,
  resolvePolygonImpact,
  resolveVehicleImpact,
  stepCollisionMotion,
  type CollisionImpact,
  type CollisionKind,
} from './collisionResponse'
import type { CircleObstacle, InteractiveVehicle, VehiclePose } from './vehicleCollision'
import type { XZVector } from './vehicleFrame'

/** Shared by every course. Shapes and velocities enter this adapter in world space.
 * Course callbacks may report exam rules; physics, animation and audio never score.
 */
export function useCollisionBody({
  kind,
  player,
  audioContext,
  audioState,
  onImpact,
}: {
  kind: CollisionKind
  player?: MutableRefObject<InteractiveVehicle>
  audioContext?: AudioContext | null
  audioState?: VehicleAudioState
  onImpact?: (impact: CollisionImpact) => void
}) {
  const motion = useRef(createCollisionMotion())
  const visual = useRef<Group>(null)
  const quietSeconds = useRef(Infinity)
  const reported = useRef(false)
  const lastSpeed = useRef(0)

  const accept = (impact: CollisionImpact) => {
    if (!impact.collided) return impact
    applyCollisionMotion(motion.current, impact)
    // A sustained scrape is one contact, not a fresh crash on every frame.
    if (quietSeconds.current > 0.15 || impact.impactSpeed > Math.max(1, lastSpeed.current * 1.8)) {
      playCollisionImpact(audioContext ?? null, impact.impactSpeed, audioState, kind)
      lastSpeed.current = impact.impactSpeed
    }
    quietSeconds.current = 0
    if (!reported.current && onImpact) {
      reported.current = true
      onImpact(impact)
    }
    return impact
  }

  return {
    motion,
    visual,
    step(dt: number) {
      if (!Number.isFinite(dt) || dt <= 0) return
      quietSeconds.current += dt
      stepCollisionMotion(motion.current, kind, dt)
    },
    circle(obstacle: CircleObstacle, velocity?: XZVector) {
      return player ? accept(resolveCircleImpact(player.current, obstacle, kind, velocity)) : undefined
    },
    circles(obstacles: readonly CircleObstacle[], velocity?: XZVector) {
      return player ? accept(resolveCircleCompoundImpact(player.current, obstacles, kind, velocity)) : undefined
    },
    vehicle(pose: VehiclePose, dimensions: { lengthMeters: number; widthMeters: number }, velocity?: XZVector) {
      return player ? accept(resolveVehicleImpact(player.current, pose, dimensions, velocity)) : undefined
    },
    polygon(points: readonly XZVector[]) {
      return player ? accept(resolvePolygonImpact(player.current, points, 'building')) : undefined
    },
    animate(heading: number) {
      const pose = collisionMotionPose(motion.current, kind, heading)
      if (visual.current) {
        visual.current.rotation.x = pose.tiltX
        visual.current.rotation.y = pose.yaw
        visual.current.rotation.z = pose.tiltZ
        visual.current.position.y = pose.lift
      }
      return pose
    },
  }
}

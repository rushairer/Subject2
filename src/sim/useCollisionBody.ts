import { useRef, type MutableRefObject } from 'react'
import type { Group } from 'three'
import { playCollisionImpact, type VehicleAudioState } from '../audio/vehicleAudio'
import {
  applyCollisionMotion,
  collisionMotionPose,
  createCollisionMotion,
  resolveSweptCircleImpact,
  resolveSweptCircleCompoundImpact,
  resolveSweptPolygonImpact,
  resolveSweptVehicleImpact,
  stepCollisionMotion,
  type CollisionImpact,
  type CollisionKind,
} from './collisionResponse'
import { vehiclePoseBeforePhysics, type CircleObstacle, type InteractiveVehicle, type VehiclePose } from './vehicleCollision'
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
  const previousCircle = useRef<CircleObstacle | null>(null)
  const previousCompound = useRef<CircleObstacle[] | null>(null)
  const previousActor = useRef<VehiclePose | null>(null)

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
      const before = previousCircle.current ?? obstacle
      previousCircle.current = { ...obstacle }
      return player ? accept(resolveSweptCircleImpact(
        player.current, vehiclePoseBeforePhysics(player.current),
        obstacle, kind, velocity, before,
      )) : undefined
    },
    circles(obstacles: readonly CircleObstacle[], velocity?: XZVector) {
      const before = previousCompound.current ?? obstacles
      previousCompound.current = obstacles.map(circle => ({ ...circle }))
      return player ? accept(resolveSweptCircleCompoundImpact(
        player.current, vehiclePoseBeforePhysics(player.current),
        obstacles, kind, velocity, before,
      )) : undefined
    },
    vehicle(pose: VehiclePose, dimensions: { lengthMeters: number; widthMeters: number }, velocity?: XZVector) {
      const before = previousActor.current ?? pose
      previousActor.current = { ...pose }
      return player ? accept(resolveSweptVehicleImpact(
        player.current, vehiclePoseBeforePhysics(player.current),
        pose, dimensions, velocity, before,
      )) : undefined
    },
    polygon(points: readonly XZVector[]) {
      return player ? accept(resolveSweptPolygonImpact(
        player.current, vehiclePoseBeforePhysics(player.current), points,
      )) : undefined
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

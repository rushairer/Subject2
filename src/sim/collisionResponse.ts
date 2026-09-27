import { convexPolygonPenetration } from './planarGeometry'
import {
  checkVehicleCircleCollision,
  type CircleObstacle,
  type InteractiveVehicle,
  type VehicleCircleCollisionResult,
  type VehiclePose,
} from './vehicleCollision'
import { orientedRectangleFootprint, vehicleBodyFootprint } from './vehicleFootprint'
import { forwardFromHeading, rightFromHeading, type XZVector } from './vehicleFrame'

export type CollisionKind = 'pedestrian' | 'vehicle' | 'scooter' | 'pole' | 'tree' | 'building' | 'cone'

export interface CollisionProfile {
  label: string
  movable: boolean
  /** Effective actor mass relative to the training car; game-response tuning, not scoring. */
  relativeMass: number
  restitution: number
  motionDamping: number
  maxActorSpeed: number
  /** Maximum additional travel from a single impact, in metres. */
  maxDisplacement: number
  maxTilt: number
  angularFrequency: number
  angularDamping: number
}

/** Conservative, non-graphic game responses. None of these values are exam thresholds. */
export const COLLISION_PROFILES: Readonly<Record<CollisionKind, CollisionProfile>> = {
  cone: {
    label: '锥桶', movable: true, relativeMass: 0.006, restitution: 0.08,
    motionDamping: 3.2, maxActorSpeed: 2.8, maxDisplacement: 0.9,
    maxTilt: 1.45, angularFrequency: 0, angularDamping: 9,
  },
  pedestrian: {
    label: '行人', movable: true, relativeMass: 0.06, restitution: 0,
    motionDamping: 5, maxActorSpeed: 1.6, maxDisplacement: 0.45,
    maxTilt: 0.4, angularFrequency: 0, angularDamping: 8,
  },
  vehicle: {
    label: '车辆', movable: true, relativeMass: 1.1, restitution: 0.05,
    motionDamping: 2.8, maxActorSpeed: 2.8, maxDisplacement: 1.1,
    maxTilt: 0.075, angularFrequency: 10, angularDamping: 3.6,
  },
  scooter: {
    label: '电动车', movable: true, relativeMass: 0.14, restitution: 0.02,
    motionDamping: 3.8, maxActorSpeed: 2, maxDisplacement: 0.65,
    maxTilt: 1.1, angularFrequency: 0, angularDamping: 6,
  },
  pole: {
    label: '立杆', movable: false, relativeMass: Infinity, restitution: 0,
    motionDamping: 6, maxActorSpeed: 0, maxDisplacement: 0,
    maxTilt: 0.08, angularFrequency: 13, angularDamping: 4.2,
  },
  tree: {
    label: '树木', movable: false, relativeMass: Infinity, restitution: 0,
    motionDamping: 6, maxActorSpeed: 0, maxDisplacement: 0,
    maxTilt: 0.16, angularFrequency: 7, angularDamping: 2.6,
  },
  building: {
    label: '建筑', movable: false, relativeMass: Infinity, restitution: 0,
    motionDamping: 6, maxActorSpeed: 0, maxDisplacement: 0,
    maxTilt: 0, angularFrequency: 0, angularDamping: 6,
  },
}

export interface CollisionImpact {
  kind: CollisionKind
  collided: boolean
  /** Relative approach speed along the contact normal, in m/s. */
  impactSpeed: number
  /** World-space unit normal from the player toward the obstacle. */
  normal: XZVector
  /** Post-impact actor world velocity, consumed by the shared motion state. */
  actorVelocity: XZVector
  strength: number
}

const SEPARATION_CLEARANCE_METERS = 1e-4
const MIN_ANIMATED_IMPACT_SPEED = 0.12
const FULL_IMPACT_SPEED = 4
const ANIMATION_RESTART_SECONDS = 0.65

function keepsSettledPose(kind: CollisionKind) {
  return kind === 'pedestrian' || kind === 'scooter' || kind === 'cone'
}

function noImpact(kind: CollisionKind, actorVelocity: XZVector): CollisionImpact {
  return {
    kind, collided: false, impactSpeed: 0, normal: { x: 0, z: 0 },
    actorVelocity: { ...actorVelocity }, strength: 0,
  }
}

function limitVelocity(velocity: XZVector, maxSpeed: number): XZVector {
  const speed = Math.hypot(velocity.x, velocity.z)
  if (speed <= maxSpeed) return velocity
  const scale = maxSpeed / speed
  return { x: velocity.x * scale, z: velocity.z * scale }
}

function separateContact(player: InteractiveVehicle, normal: XZVector, penetration: number) {
  const separation = Math.max(0, penetration) + SEPARATION_CLEARANCE_METERS
  player.x -= normal.x * separation
  player.z -= normal.z * separation
}

function resolveContact(
  player: InteractiveVehicle,
  kind: CollisionKind,
  normal: XZVector,
  penetration: number,
  incomingActorVelocity: XZVector,
): CollisionImpact {
  const profile = COLLISION_PROFILES[kind]
  const actorVelocity = profile.movable ? incomingActorVelocity : { x: 0, z: 0 }
  const forward = forwardFromHeading(player.heading)
  const normalAlongForward = forward.x * normal.x + forward.z * normal.z
  const playerNormalSpeed = player.speed * normalAlongForward
  const actorNormalSpeed = actorVelocity.x * normal.x + actorVelocity.z * normal.z
  const impactSpeed = Math.max(0, playerNormalSpeed - actorNormalSpeed)

  // Position correction is independent of speed: stationary overlap and retreat
  // must also finish outside the actual body/circle geometry.
  separateContact(player, normal, penetration)

  const inverseActorMass = profile.movable ? 1 / profile.relativeMass : 0
  const impulse = (1 + profile.restitution) * impactSpeed / (1 + inverseActorMass)
  if (playerNormalSpeed > 0 && impactSpeed > 0) {
    // The powertrain has one signed speed, not a lateral velocity state. Project
    // the collision impulse onto its forward axis, retaining glancing motion.
    // Clamping preserves the selected travel direction: no synthetic rebound
    // into reverse, acceleration from contact, or braking when driving away.
    const speedLoss = impulse * Math.abs(normalAlongForward)
    player.speed = Math.sign(player.speed) * Math.max(0, Math.abs(player.speed) - speedLoss)
  }

  const displacedActorVelocity = profile.movable
    ? limitVelocity({
      x: actorVelocity.x + normal.x * impulse * inverseActorMass,
      z: actorVelocity.z + normal.z * impulse * inverseActorMass,
    }, Math.min(profile.maxActorSpeed, profile.maxDisplacement * profile.motionDamping))
    : { x: 0, z: 0 }

  return {
    kind, collided: true, impactSpeed, normal,
    actorVelocity: displacedActorVelocity,
    strength: Math.min(1, Math.max(0,
      (impactSpeed - MIN_ANIMATED_IMPACT_SPEED) / (FULL_IMPACT_SPEED - MIN_ANIMATED_IMPACT_SPEED),
    )),
  }
}

export function resolveCircleImpact(
  player: InteractiveVehicle,
  obstacle: CircleObstacle,
  kind: CollisionKind,
  actorVelocity: XZVector = { x: 0, z: 0 },
): CollisionImpact {
  const collision = checkVehicleCircleCollision(player, obstacle)
  return collision.colliding
    ? resolveContact(player, kind, collision.normal, collision.penetration, actorVelocity)
    : noImpact(kind, actorVelocity)
}

function deepestCircleContact(player: InteractiveVehicle, obstacles: readonly CircleObstacle[]) {
  let deepest: VehicleCircleCollisionResult | undefined
  for (const obstacle of obstacles) {
    const contact = checkVehicleCircleCollision(player, obstacle)
    if (contact.colliding && (!deepest || contact.penetration > deepest.penetration)) deepest = contact
  }
  return deepest
}

/**
 * A leaning/fallen actor may have several compact circle proxies. They form one
 * physical body: resolve all overlap, but transfer momentum only once per frame.
 */
export function resolveCircleCompoundImpact(
  player: InteractiveVehicle,
  obstacles: readonly CircleObstacle[],
  kind: CollisionKind,
  actorVelocity: XZVector = { x: 0, z: 0 },
): CollisionImpact {
  const initialContact = deepestCircleContact(player, obstacles)
  if (!initialContact) return noImpact(kind, actorVelocity)

  const impact = resolveContact(player, kind, initialContact.normal, initialContact.penetration, actorVelocity)
  // Each following pass corrects only position, without replaying either the
  // car slowdown or the actor's outgoing impulse for every overlapping proxy.
  const maximumPasses = Math.min(16, Math.max(4, obstacles.length * 2))
  for (let pass = 0; pass < maximumPasses; pass++) {
    const contact = deepestCircleContact(player, obstacles)
    if (!contact) return impact
    separateContact(player, contact.normal, contact.penetration)
  }
  if (!deepestCircleContact(player, obstacles)) return impact

  // Contradictory normals can alternate if a pose begins inside a whole chain
  // (for example on reset). Exit the union along the first contact's separation
  // direction. Strictly separated projection intervals prove no circle can
  // remain intersecting; this fallback is finite and never applies an impulse.
  const normal = initialContact.normal
  let unionMinimum = Infinity
  for (const obstacle of obstacles) {
    unionMinimum = Math.min(unionMinimum,
      obstacle.x * normal.x + obstacle.z * normal.z - obstacle.radius)
  }
  let bodyMaximum = -Infinity
  for (const corner of vehicleBodyFootprint(player)) {
    bodyMaximum = Math.max(bodyMaximum, corner.x * normal.x + corner.z * normal.z)
  }
  separateContact(player, normal, bodyMaximum - unionMinimum)
  return impact
}

export function resolveVehicleImpact(
  player: InteractiveVehicle,
  actor: VehiclePose,
  dimensions: { lengthMeters: number; widthMeters: number },
  actorVelocity: XZVector = { x: 0, z: 0 },
): CollisionImpact {
  return resolveFootprintImpact(player, orientedRectangleFootprint(
    actor, dimensions.lengthMeters, dimensions.widthMeters,
  ), 'vehicle', actorVelocity)
}

export function resolvePolygonImpact(
  player: InteractiveVehicle,
  polygon: readonly XZVector[],
  kind: 'building',
  actorVelocity: XZVector = { x: 0, z: 0 },
): CollisionImpact {
  return resolveFootprintImpact(player, polygon, kind, actorVelocity)
}

function resolveFootprintImpact(
  player: InteractiveVehicle,
  polygon: readonly XZVector[],
  kind: CollisionKind,
  actorVelocity: XZVector,
): CollisionImpact {
  const collision = convexPolygonPenetration(vehicleBodyFootprint(player), polygon)
  if (!collision.intersecting) return noImpact(kind, actorVelocity)
  // Shared SAT returns obstacle→player; all collision-response callers use the
  // opposite, player→obstacle convention used by circle contact geometry.
  return resolveContact(player, kind, {
    x: -collision.normal.x,
    z: -collision.normal.z,
  }, collision.penetration, actorVelocity)
}

export interface CollisionMotion {
  offsetX: number
  offsetZ: number
  velocityX: number
  velocityZ: number
  elapsed: number
  impactSpeed: number
  normalX: number
  normalZ: number
  strength: number
  /** Latches a meaningful impact so a moving actor does not resume its route. */
  active: boolean
}

export function createCollisionMotion(): CollisionMotion {
  return {
    offsetX: 0, offsetZ: 0, velocityX: 0, velocityZ: 0,
    elapsed: 0, impactSpeed: 0, normalX: 0, normalZ: 0, strength: 0, active: false,
  }
}

export function applyCollisionMotion(state: CollisionMotion, impact: CollisionImpact): void {
  if (!impact.collided || impact.strength <= 0) return
  const profile = COLLISION_PROFILES[impact.kind]
  const velocity = limitVelocity(impact.actorVelocity,
    Math.min(profile.maxActorSpeed, profile.maxDisplacement * profile.motionDamping))
  state.velocityX = velocity.x
  state.velocityZ = velocity.z
  const heldPose = keepsSettledPose(impact.kind)
  const restartVisual = !state.active || (!heldPose && state.elapsed > ANIMATION_RESTART_SECONDS)
  if (restartVisual) {
    state.elapsed = 0
    state.normalX = impact.normal.x
    state.normalZ = impact.normal.z
  }
  // Continuing contact must not reset the animation every frame. A fallen
  // cone/scooter and a pedestrian's held stumble do not pop back upright when
  // pushed again. Spring responses can begin another pulse after settling.
  state.impactSpeed = state.active && heldPose
    ? Math.max(state.impactSpeed, impact.impactSpeed)
    : impact.impactSpeed
  state.strength = state.active && (heldPose || !restartVisual)
    ? Math.max(state.strength, impact.strength)
    : impact.strength
  state.active = true
}

/** Exact exponential integration: one long frame and many small frames agree. */
export function stepCollisionMotion(state: CollisionMotion, kind: CollisionKind, dt: number): void {
  if (!state.active || !Number.isFinite(dt) || dt <= 0) return
  const profile = COLLISION_PROFILES[kind]
  state.elapsed += dt
  if (!profile.movable) {
    state.velocityX = 0
    state.velocityZ = 0
    return
  }
  const decay = Math.exp(-profile.motionDamping * dt)
  const distanceScale = -Math.expm1(-profile.motionDamping * dt) / profile.motionDamping
  state.offsetX += state.velocityX * distanceScale
  state.offsetZ += state.velocityZ * distanceScale
  state.velocityX *= decay
  state.velocityZ *= decay
}

/** Model-local visual response; keep a fixed trunk/pole collider at its base. */
export function collisionMotionPose(state: CollisionMotion, kind: CollisionKind, heading: number) {
  if (!state.active) return { tiltX: 0, tiltZ: 0, lift: 0 }
  const profile = COLLISION_PROFILES[kind]
  const forward = forwardFromHeading(heading)
  const right = rightFromHeading(heading)
  const normalForward = state.normalX * forward.x + state.normalZ * forward.z
  const normalRight = state.normalX * right.x + state.normalZ * right.z
  const amplitude = profile.maxTilt * state.strength
  if (keepsSettledPose(kind)) {
    const settled = -Math.expm1(-profile.angularDamping * state.elapsed)
    const lean = amplitude * settled
    if (kind === 'scooter') {
      const side = Math.abs(normalRight) > 0.05 ? Math.sign(normalRight) : 1
      return { tiltX: -normalForward * lean * 0.12, tiltZ: -side * lean, lift: 0 }
    }
    // A restrained held loss of balance keeps the upright radial proxy useful;
    // the renderer must conservatively cover any horizontal model overhang.
    return { tiltX: -normalForward * lean, tiltZ: -normalRight * lean, lift: 0 }
  }
  const oscillation = Math.sin(state.elapsed * profile.angularFrequency)
    * Math.exp(-state.elapsed * profile.angularDamping)
  return {
    tiltX: -normalForward * amplitude * oscillation,
    tiltZ: -normalRight * amplitude * oscillation,
    lift: kind === 'vehicle' ? Math.abs(oscillation) * state.strength * 0.025 : 0,
  }
}

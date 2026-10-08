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
import {
  interpolateCollisionCircle,
  interpolateCollisionPose,
  sweptCircleContactFraction,
  sweptPolygonContactFraction,
  sweptVehicleContactFraction,
} from './sweptCollision'

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
    label: '锥桶', movable: true, relativeMass: 0.006, restitution: 0.16,
    motionDamping: 2.3, maxActorSpeed: 18, maxDisplacement: 7.8,
    maxTilt: 1.52, angularFrequency: 0, angularDamping: 7,
  },
  pedestrian: {
    label: '行人', movable: true, relativeMass: 0.06, restitution: 0.01,
    motionDamping: 2.2, maxActorSpeed: 16, maxDisplacement: 7.2,
    maxTilt: 1.48, angularFrequency: 0, angularDamping: 5,
  },
  vehicle: {
    label: '车辆', movable: true, relativeMass: 1.1, restitution: 0.05,
    motionDamping: 2.8, maxActorSpeed: 5, maxDisplacement: 1.8,
    maxTilt: 0.075, angularFrequency: 10, angularDamping: 3.6,
  },
  scooter: {
    label: '电动车', movable: true, relativeMass: 0.14, restitution: 0.03,
    motionDamping: 2, maxActorSpeed: 14, maxDisplacement: 7,
    maxTilt: 1.5, angularFrequency: 0, angularDamping: 4.8,
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
const ANIMATION_RESTART_SECONDS = 0.65
const GRAVITY_METERS_PER_SECOND_SQUARED = 9.81

/** Speed at which the visual response reaches roughly half strength. */
const IMPACT_RESPONSE_SPEED: Readonly<Record<CollisionKind, number>> = {
  cone: 2.2,
  pedestrian: 4.5,
  vehicle: 6.5,
  scooter: 5.2,
  pole: 5,
  tree: 6,
  building: 7,
}

const LAUNCH_RESPONSE: Readonly<Record<CollisionKind, {
  threshold: number
  scale: number
  maximum: number
}>> = {
  cone: { threshold: 2.5, scale: 0.38, maximum: 3.2 },
  pedestrian: { threshold: 5, scale: 0.32, maximum: 3.4 },
  scooter: { threshold: 6, scale: 0.22, maximum: 2.2 },
  vehicle: { threshold: Infinity, scale: 0, maximum: 0 },
  pole: { threshold: Infinity, scale: 0, maximum: 0 },
  tree: { threshold: Infinity, scale: 0, maximum: 0 },
  building: { threshold: Infinity, scale: 0, maximum: 0 },
}

const MAX_YAW_RESPONSE: Readonly<Record<CollisionKind, number>> = {
  pedestrian: 0.55,
  scooter: 1.1,
  cone: 0,
  vehicle: 0,
  pole: 0,
  tree: 0,
  building: 0,
}

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

function smoothStep(edge0: number, edge1: number, value: number) {
  if (value <= edge0) return 0
  if (value >= edge1) return 1
  const t = (value - edge0) / (edge1 - edge0)
  return t * t * (3 - 2 * t)
}

function impactResponseStrength(kind: CollisionKind, impactSpeed: number) {
  const speed = Math.max(0, impactSpeed - MIN_ANIMATED_IMPACT_SPEED)
  if (speed <= 0) return 0
  const reference = IMPACT_RESPONSE_SPEED[kind]
  const speedSquared = speed * speed
  return speedSquared / (speedSquared + reference * reference)
}

function ballisticLift(state: CollisionMotion, kind: CollisionKind) {
  const response = LAUNCH_RESPONSE[kind]
  const launchVelocity = Math.min(
    response.maximum,
    Math.max(0, state.impactSpeed - response.threshold) * response.scale,
  )
  if (launchVelocity <= 0) return 0
  return Math.max(
    0,
    launchVelocity * state.elapsed
      - 0.5 * GRAVITY_METERS_PER_SECOND_SQUARED * state.elapsed * state.elapsed,
  )
}

function settledTiltAmplitude(state: CollisionMotion, kind: CollisionKind) {
  const profile = COLLISION_PROFILES[kind]
  if (kind === 'pedestrian') {
    const stumble = 0.52 * smoothStep(0, 0.3, state.strength)
    return stumble + (profile.maxTilt - stumble) * smoothStep(0.38, 0.78, state.strength)
  }
  if (kind === 'scooter') {
    const initialLean = 0.68 * smoothStep(0, 0.2, state.strength)
    return initialLean + (profile.maxTilt - initialLean) * smoothStep(0.16, 0.52, state.strength)
  }
  if (kind === 'cone') return profile.maxTilt * smoothStep(0.03, 0.3, state.strength)
  return profile.maxTilt * state.strength
}

function settledYaw(state: CollisionMotion, kind: CollisionKind, normalRight: number) {
  const maximum = MAX_YAW_RESPONSE[kind]
  const glancing = Math.min(1, Math.abs(normalRight))
  if (maximum <= 0 || glancing < 0.05) return 0
  const response = smoothStep(0.25, 0.9, state.strength)
  const settled = -Math.expm1(-3.5 * state.elapsed)
  return -Math.sign(normalRight) * maximum * glancing * response * settled
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
    strength: impactResponseStrength(kind, impactSpeed),
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

/**
 * A swept query finds the first contact on the body-center path. Reuse the
 * existing narrow-phase impulse, separation, actor animation and scoring
 * pipeline at that contact. Do not apply a synthetic speed clamp or teleport
 * past an object that the final-frame overlap test would have missed.
 */
function resolveFirstSweptContact(
  player: InteractiveVehicle,
  before: VehiclePose | undefined,
  fraction: number | null,
  atFraction: (fraction: number) => CollisionImpact,
  atEnd: () => CollisionImpact,
): CollisionImpact {
  if (!before || fraction === null) return atEnd()
  const end = { x: player.x, z: player.z, heading: player.heading }

  // Conservative advancement stops within a micrometre of contact. Step a
  // small additional fraction to obtain an actual overlapping manifold from
  // the unchanged narrow-phase resolver; near misses stay misses.
  for (const margin of [0, 0.00001, 0.0001, 0.001, 0.005]) {
    const contactFraction = Math.min(1, fraction + margin)
    const contactPose = interpolateCollisionPose(before, end, contactFraction)
    player.x = contactPose.x
    player.z = contactPose.z
    player.heading = contactPose.heading
    const impact = atFraction(contactFraction)
    if (impact.collided) return impact
  }

  player.x = end.x
  player.z = end.z
  player.heading = end.heading
  return atEnd()
}

export function resolveSweptCircleImpact(
  player: InteractiveVehicle,
  playerBefore: VehiclePose | undefined,
  obstacle: CircleObstacle,
  kind: CollisionKind,
  actorVelocity: XZVector = { x: 0, z: 0 },
  obstacleBefore: CircleObstacle = obstacle,
): CollisionImpact {
  const fraction = playerBefore
    ? sweptCircleContactFraction(playerBefore, player, obstacleBefore, obstacle)
    : null
  return resolveFirstSweptContact(player, playerBefore, fraction,
    t => resolveCircleImpact(player,
      interpolateCollisionCircle(obstacleBefore, obstacle, t), kind, actorVelocity),
    () => resolveCircleImpact(player, obstacle, kind, actorVelocity))
}

export function resolveSweptCircleCompoundImpact(
  player: InteractiveVehicle,
  playerBefore: VehiclePose | undefined,
  obstacles: readonly CircleObstacle[],
  kind: CollisionKind,
  actorVelocity: XZVector = { x: 0, z: 0 },
  obstaclesBefore: readonly CircleObstacle[] = obstacles,
): CollisionImpact {
  let earliest: number | null = null
  const canSweep = playerBefore && obstaclesBefore.length === obstacles.length
  if (canSweep) {
    for (let i = 0; i < obstacles.length; i += 1) {
      const fraction = sweptCircleContactFraction(
        playerBefore, player, obstaclesBefore[i], obstacles[i],
      )
      if (fraction !== null && (earliest === null || fraction < earliest)) earliest = fraction
    }
  }
  return resolveFirstSweptContact(player, playerBefore, earliest,
    t => resolveCircleCompoundImpact(player,
      obstacles.map((obstacle, i) =>
        interpolateCollisionCircle(obstaclesBefore[i], obstacle, t)),
      kind, actorVelocity),
    () => resolveCircleCompoundImpact(player, obstacles, kind, actorVelocity))
}

export function resolveSweptVehicleImpact(
  player: InteractiveVehicle,
  playerBefore: VehiclePose | undefined,
  actor: VehiclePose,
  dimensions: { lengthMeters: number; widthMeters: number },
  actorVelocity: XZVector = { x: 0, z: 0 },
  actorBefore: VehiclePose = actor,
): CollisionImpact {
  const fraction = playerBefore
    ? sweptVehicleContactFraction(playerBefore, player, actorBefore, actor, dimensions)
    : null
  return resolveFirstSweptContact(player, playerBefore, fraction,
    t => resolveVehicleImpact(player,
      interpolateCollisionPose(actorBefore, actor, t), dimensions, actorVelocity),
    () => resolveVehicleImpact(player, actor, dimensions, actorVelocity))
}

export function resolveSweptPolygonImpact(
  player: InteractiveVehicle,
  playerBefore: VehiclePose | undefined,
  polygon: readonly XZVector[],
): CollisionImpact {
  const fraction = playerBefore
    ? sweptPolygonContactFraction(playerBefore, player, polygon)
    : null
  return resolveFirstSweptContact(player, playerBefore, fraction,
    () => resolvePolygonImpact(player, polygon, 'building'),
    () => resolvePolygonImpact(player, polygon, 'building'))
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
  if (!state.active) return { tiltX: 0, tiltZ: 0, yaw: 0, lift: 0 }
  const profile = COLLISION_PROFILES[kind]
  const forward = forwardFromHeading(heading)
  const right = rightFromHeading(heading)
  const normalForward = state.normalX * forward.x + state.normalZ * forward.z
  const normalRight = state.normalX * right.x + state.normalZ * right.z

  if (keepsSettledPose(kind)) {
    const settled = -Math.expm1(-profile.angularDamping * state.elapsed)
    const lean = settledTiltAmplitude(state, kind) * settled
    const yaw = settledYaw(state, kind, normalRight)
    const lift = ballisticLift(state, kind)

    if (kind === 'scooter') {
      // Broadside hits topple the scooter sideways. Near head-on/rear impacts
      // pitch the bike in the travel plane instead of always choosing one side.
      if (Math.abs(normalRight) > 0.15) {
        return {
          tiltX: -normalForward * lean * 0.16,
          tiltZ: -Math.sign(normalRight) * lean,
          yaw,
          lift,
        }
      }
      return {
        tiltX: -normalForward * lean * 0.9,
        tiltZ: -normalRight * lean,
        yaw,
        lift,
      }
    }

    return {
      tiltX: -normalForward * lean,
      tiltZ: -normalRight * lean,
      yaw,
      lift,
    }
  }

  const amplitude = profile.maxTilt * state.strength
  const oscillation = Math.sin(state.elapsed * profile.angularFrequency)
    * Math.exp(-state.elapsed * profile.angularDamping)
  return {
    tiltX: -normalForward * amplitude * oscillation,
    tiltZ: -normalRight * amplitude * oscillation,
    yaw: 0,
    lift: kind === 'vehicle' ? Math.abs(oscillation) * state.strength * 0.025 : 0,
  }
}

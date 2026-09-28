import { DRIVING_RULES } from '../rules/drivingRules'
import { normalizeHeadingDelta } from '../sim/vehicleFrame'

export interface CoachVehicleState {
  x: number
  z: number
  heading: number
  speed: number
  gear: number
}

export interface CoachWaypoint {
  x: number
  z: number
  /** Positive magnitude. Direction comes from gear. */
  targetSpeedMps: number
  gear: -1 | 1
  arrivalRadiusMeters?: number
  stop?: boolean
  holdSeconds?: number
  leftIndicator?: boolean
  rightIndicator?: boolean
  /** Signed curvature of the desired travel path, positive turns right. */
  pathCurvaturePerMeter?: number
  /** Critical geometry points must be physically captured, never skipped by projection. */
  requireCapture?: boolean
  label?: string
}

export interface CoachPlan {
  id: string
  title: string
  waypoints: readonly CoachWaypoint[]
  lookAheadWaypoints?: number
  steeringGain?: number
  curvatureFeedforwardBlend?: number
}

export interface CoachRuntime {
  waypointIndex: number
  holdSeconds: number
  completed: boolean
}

export interface CoachCommand {
  throttle: number
  brake: number
  clutch: number
  steeringWheelTarget: number
  gear: -1 | 1
  engineOn: true
  handbrake: boolean
  seatbelt: true
  leftIndicator: boolean
  rightIndicator: boolean
  waypointIndex: number
  completed: boolean
  status: string
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

function bearingTo(
  from: Pick<CoachVehicleState, 'x' | 'z'>,
  to: Pick<CoachWaypoint, 'x' | 'z'>,
) {
  return Math.atan2(to.x - from.x, -(to.z - from.z))
}

function distanceTo(
  from: Pick<CoachVehicleState, 'x' | 'z'>,
  to: Pick<CoachWaypoint, 'x' | 'z'>,
) {
  return Math.hypot(to.x - from.x, to.z - from.z)
}

function hasPassedWaypoint(
  vehicle: Pick<CoachVehicleState, 'x' | 'z'>,
  previous: Pick<CoachWaypoint, 'x' | 'z'>,
  target: Pick<CoachWaypoint, 'x' | 'z'>,
  corridorMeters?: number,
) {
  const segmentX = target.x - previous.x
  const segmentZ = target.z - previous.z
  const segmentLengthSquared = segmentX * segmentX + segmentZ * segmentZ
  if (segmentLengthSquared < 1e-6) return false
  const passedProjection =
    (vehicle.x - target.x) * segmentX +
    (vehicle.z - target.z) * segmentZ
  const distanceFromTarget = Math.hypot(
    vehicle.x - target.x,
    vehicle.z - target.z,
  )
  const passCorridorMeters = corridorMeters ?? Math.max(
    0.9,
    Math.sqrt(segmentLengthSquared) * 2.4,
  )
  return passedProjection >= 0 && distanceFromTarget <= passCorridorMeters
}

export function createCoachRuntime(): CoachRuntime {
  return {
    waypointIndex: 0,
    holdSeconds: 0,
    completed: false,
  }
}

/**
 * Deterministic low-level path follower for coach/golden-driver sessions.
 *
 * This controller deliberately emits the same steering-wheel/pedal inputs a
 * human driver would. It never moves the vehicle pose directly, so the real
 * vehicle physics, collision system and course judges remain authoritative.
 */
export function stepCoachController(
  plan: CoachPlan,
  vehicle: CoachVehicleState,
  previous: CoachRuntime,
  dt: number,
  automatic: boolean,
): { runtime: CoachRuntime; command: CoachCommand } {
  if (plan.waypoints.length === 0) {
    throw new Error('Coach plan requires at least one waypoint')
  }

  const runtime = { ...previous }
  if (runtime.completed) {
    return {
      runtime,
      command: {
        throttle: 0,
        brake: 1,
        clutch: automatic ? 0 : 1,
        steeringWheelTarget: 0,
        gear: plan.waypoints[plan.waypoints.length - 1].gear,
        engineOn: true,
        handbrake: true,
        seatbelt: true,
        leftIndicator: false,
        rightIndicator: false,
        waypointIndex: runtime.waypointIndex,
        completed: true,
        status: '教练示范完成',
      },
    }
  }

  const lastIndex = plan.waypoints.length - 1
  let index = clamp(runtime.waypointIndex, 0, lastIndex)
  let target = plan.waypoints[index]
  let distance = distanceTo(vehicle, target)
  const arrivalRadius = target.arrivalRadiusMeters ?? 0.75

  while (!target.stop && index < lastIndex) {
    const previousTarget = index > 0 ? plan.waypoints[index - 1] : null
    const curvedTarget = Math.abs(target.pathCurvaturePerMeter ?? 0) > 1e-5
    const captureOnly = target.requireCapture === true
    const passCorridorMeters = curvedTarget
      ? Math.max(0.28, arrivalRadius * 2.5)
      : undefined
    const reached =
      distance <= arrivalRadius ||
      (!captureOnly &&
        previousTarget != null &&
        hasPassedWaypoint(
          vehicle,
          previousTarget,
          target,
          passCorridorMeters,
        ))
    if (!reached) break
    index += 1
    target = plan.waypoints[index]
    distance = distanceTo(vehicle, target)
  }
  runtime.waypointIndex = index

  const nearStop = !!target.stop && distance <= arrivalRadius
  if (nearStop && Math.abs(vehicle.speed) <= 0.06) {
    runtime.holdSeconds += dt
    if (runtime.holdSeconds >= (target.holdSeconds ?? 0.35)) {
      if (index >= lastIndex) {
        runtime.completed = true
      } else {
        runtime.waypointIndex = index + 1
        runtime.holdSeconds = 0
        target = plan.waypoints[runtime.waypointIndex]
        distance = distanceTo(vehicle, target)
      }
    }
  } else if (!nearStop) {
    runtime.holdSeconds = 0
  }

  if (!target.stop && index >= lastIndex && distance <= arrivalRadius) {
    runtime.completed = true
  }

  const direction = target.gear
  let steeringIndex = runtime.waypointIndex
  if (!target.stop) {
    const lookAhead = plan.lookAheadWaypoints ?? 3
    const segmentCurvature = target.pathCurvaturePerMeter ?? 0
    for (let step = 0; step < lookAhead && steeringIndex < lastIndex; step++) {
      const candidateIndex = steeringIndex + 1
      const candidate = plan.waypoints[candidateIndex]
      if (candidate.gear !== direction) break
      const candidateCurvature = candidate.pathCurvaturePerMeter ?? 0
      if (Math.abs(candidateCurvature - segmentCurvature) > 1e-5) break
      steeringIndex = candidateIndex
      if (candidate.stop) break
    }
  }
  const steeringTarget = plan.waypoints[steeringIndex]
  const steeringDistance = Math.max(0.5, distanceTo(vehicle, steeringTarget))
  const travelBearing = bearingTo(vehicle, steeringTarget)
  const travelHeading = normalizeHeadingDelta(
    vehicle.heading + (direction < 0 ? Math.PI : 0),
  )
  const alpha = normalizeHeadingDelta(travelBearing - travelHeading)
  const pursuitCurvature =
    2 * Math.sin(alpha) / steeringDistance * (plan.steeringGain ?? 1)
  const feedforwardBlend = clamp(plan.curvatureFeedforwardBlend ?? 0, 0, 1)
  const commandedCurvature = target.pathCurvaturePerMeter == null
    ? pursuitCurvature
    : target.pathCurvaturePerMeter * feedforwardBlend +
      pursuitCurvature * (1 - feedforwardBlend)
  const roadWheelTarget = clamp(
    Math.atan(DRIVING_RULES.steering.wheelbaseMeters * commandedCurvature) *
      direction,
    -DRIVING_RULES.steering.roadWheelMaxAngleRadians,
    DRIVING_RULES.steering.roadWheelMaxAngleRadians,
  )
  const maxSteeringWheelAngle =
    DRIVING_RULES.steering.wheelTurnsLockToLock * Math.PI
  const steeringWheelTarget =
    roadWheelTarget /
    DRIVING_RULES.steering.roadWheelMaxAngleRadians *
    maxSteeringWheelAngle

  const requestedSpeed = nearStop
    ? 0
    : target.stop
      ? clamp(distance * 0.5, 0.04, 0.48)
      : Math.max(0, target.targetSpeedMps)
  const alongSpeed = vehicle.speed * direction
  let throttle = 0
  let brake = 0

  if (nearStop) {
    brake = 0.58
  } else if (alongSpeed < -0.04) {
    brake = 0.85
  } else if (target.stop && alongSpeed > requestedSpeed + 0.02) {
    // Automatic creep is strong enough to drift through a precision stop if
    // we reuse the normal cruising dead-band. Keep a light brake bias while
    // converging on a stop point, then clamp firmly inside its capture radius.
    brake = clamp(0.1 + (alongSpeed - requestedSpeed) * 1.1, 0.1, 0.68)
  } else if (!target.stop && alongSpeed > requestedSpeed + 0.12) {
    brake = clamp((alongSpeed - requestedSpeed) * 0.75, 0.12, 0.7)
  } else if (!target.stop && requestedSpeed > 0 && alongSpeed < requestedSpeed - 0.05) {
    throttle = clamp(0.18 + (requestedSpeed - Math.max(0, alongSpeed)) * 0.2, 0.18, 0.42)
  }

  const clutch = automatic
    ? 0
    : Math.abs(vehicle.speed) < 0.75
      ? 0.46
      : 0.06

  return {
    runtime,
    command: {
      throttle,
      brake,
      clutch,
      steeringWheelTarget: runtime.completed ? 0 : steeringWheelTarget,
      gear: target.gear,
      engineOn: true,
      handbrake: runtime.completed,
      seatbelt: true,
      leftIndicator: target.leftIndicator ?? false,
      rightIndicator: target.rightIndicator ?? false,
      waypointIndex: runtime.waypointIndex,
      completed: runtime.completed,
      status: target.label ?? `教练驾驶 · 路径点 ${runtime.waypointIndex + 1}/${plan.waypoints.length}`,
    },
  }
}

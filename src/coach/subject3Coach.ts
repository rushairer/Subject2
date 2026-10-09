import { DRIVING_RULES } from '../rules/drivingRules'
import { normalizeHeadingDelta } from '../sim/vehicleFrame'
import { TRAINING_CAR_DYNAMICS } from '../sim/vehicleTireDynamics'
import { assistCoachStability } from './coachStabilityAssist'
import { rainCoachStoppingEnvelope, RAIN_COACH_DEFENSE } from './rainDefensiveBraking'
import {
  SUBJECT3_EVENTS,
  SUBJECT3_ROUTE_LENGTH,
  poseAtRouteDistance,
  projectToSubject3Route,
} from '../subject3/subject3Route'
import {
  observeSubject3LeadVehicle,
} from '../subject3/subject3LeadVehicle'
import {
  observeSubject3CutInHazard,
  observeSubject3PedestrianHazard,
} from '../subject3/subject3HazardObservation'
import type { Subject3TrafficState } from '../subject3/subject3Traffic'
import type { Subject3PracticeSliceId } from '../subject3/subject3Practice'

export interface Subject3CoachVehicle {
  x: number
  z: number
  heading: number
  speed: number
  gear: number
  lateralSpeed?: number
  yawRate?: number
}

export interface Subject3CoachRoadConditions {
  /** Only set for explicitly chosen advanced rain practice. */
  surface: 'rain'
  localWaterDepthMm: number
}

export interface Subject3CoachRuntime {
  elapsedSeconds: number
  defensiveRecovery: boolean
}

export interface Subject3CoachCommand {
  throttle: number
  brake: number
  clutch: number
  steeringWheelTarget: number
  gear: number
  engineOn: true
  handbrake: boolean
  seatbelt: true
  leftIndicator: boolean
  rightIndicator: boolean
  lowBeam: boolean
  highBeam: false
  horn: false
  lookLeft: boolean
  lookRight: boolean
  lookBack: boolean
  status: string
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

const lerp = (a: number, b: number, t: number) =>
  a + (b - a) * clamp(t, 0, 1)

export const SUBJECT3_COACH_PULL_OVER_STOP_PROGRESS = 4180

export function createSubject3CoachRuntime(): Subject3CoachRuntime {
  return {
    elapsedSeconds: 0,
    defensiveRecovery: false,
  }
}

/**
 * Canonical lane position used by the production coach and CI Golden Driver.
 * Negative lateral values are the left/overtaking lane; +0.6 m is the
 * pull-over offset that leaves the training car about 30 cm from the edge.
 */
export function subject3CoachDesiredLateral(progress: number) {
  if (progress >= 1835 && progress < 1915) {
    return lerp(0, -2.2, (progress - 1835) / 80)
  }
  if (progress >= 1915 && progress < 2040) return -2.2
  if (progress >= 2040 && progress < 2060) {
    return lerp(-2.2, 0, (progress - 2040) / 20)
  }

  if (progress >= 2060 && progress < 2110) {
    return lerp(0, -2.2, (progress - 2060) / 50)
  }
  if (progress >= 2110 && progress < 2160) return -2.2
  if (progress >= 2160 && progress < 2210) {
    return lerp(-2.2, -1.0, (progress - 2160) / 50)
  }
  if (progress >= 2210 && progress < 2240) return -1.0
  if (progress >= 2240 && progress < 2270) {
    return lerp(-1.0, 0, (progress - 2240) / 30)
  }

  if (progress >= 4100 && progress < 4170) {
    return lerp(0, 0.6, (progress - 4100) / 70)
  }
  if (progress >= 4170) return 0.6
  return 0
}

export function subject3CoachSignalState(progress: number) {
  const left =
    progress <= 120 ||
    (progress >= 625 && progress <= 770) ||
    (progress >= 1835 && progress < 2135) ||
    (progress >= 2235 && progress <= 2380) ||
    (progress >= 2835 && progress <= 3020) ||
    (progress >= 3435 && progress <= 3820)

  const right =
    (progress >= 915 && progress <= 1090) ||
    (progress >= 2135 && progress <= 2240) ||
    progress >= 4070

  return { left, right }
}

export function subject3CoachManualGearState(
  progress: number,
  elapsedSeconds: number,
) {
  const gearEvent = SUBJECT3_EVENTS.find(event => event.id === 'gear')
  if (!gearEvent) throw new Error('Subject 3 gear event is missing')

  if (progress < 5 && elapsedSeconds < 3.3) {
    return { gear: 1, clutch: 1 }
  }
  if (progress < 5 && elapsedSeconds < 4.3) {
    return {
      gear: 1,
      clutch: DRIVING_RULES.manualTransmission.biteClutchPosition,
    }
  }
  if (progress < 5 && elapsedSeconds < 4.4) {
    return { gear: 1, clutch: 1 }
  }
  if (progress < gearEvent.start) return { gear: 1, clutch: 0 }
  if (progress < gearEvent.start + 5) return { gear: 2, clutch: 1 }
  if (progress < gearEvent.start + 40) return { gear: 2, clutch: 0 }
  if (progress < gearEvent.start + 45) return { gear: 3, clutch: 1 }
  if (progress < gearEvent.start + 80) return { gear: 3, clutch: 0 }
  if (progress < gearEvent.start + 85) return { gear: 4, clutch: 1 }
  if (progress < gearEvent.end + 10) return { gear: 4, clutch: 0 }
  if (progress < gearEvent.end + 15) return { gear: 3, clutch: 1 }
  return { gear: 3, clutch: 0 }
}

function subject3CoachPracticeManualGearState(
  vehicle: Subject3CoachVehicle,
) {
  const speed = Math.abs(vehicle.speed)
  const desiredGear = speed < 2.6 ? 1 : speed < 5.4 ? 2 : 3

  if (vehicle.gear !== desiredGear) {
    return { gear: desiredGear, clutch: 1 }
  }
  if (desiredGear === 1 && speed < 0.3) {
    return {
      gear: 1,
      clutch: DRIVING_RULES.manualTransmission.biteClutchPosition,
    }
  }
  return { gear: desiredGear, clutch: 0 }
}

function subject3CoachDefensiveManualGearState(
  vehicle: Subject3CoachVehicle,
  stopping: boolean,
) {
  const adaptive = subject3CoachPracticeManualGearState(vehicle)
  if (!stopping) return adaptive
  return {
    gear: adaptive.gear,
    clutch: 1,
  }
}

function routeTarget(progress: number, lateral: number) {
  const pose = poseAtRouteDistance(progress)
  return {
    x: pose.x + pose.rightX * lateral,
    z: pose.z + pose.rightZ * lateral,
  }
}

function eventTitle(progress: number) {
  const event =
    SUBJECT3_EVENTS.find(item => progress >= item.start && progress <= item.end) ??
    SUBJECT3_EVENTS.find(item => progress < item.start)
  return event?.title ?? '靠边停车'
}

function defensiveTargetSpeedKmh(
  vehicle: Subject3CoachVehicle,
  traffic: Readonly<Subject3TrafficState>,
  progress: number,
  roadConditions?: Subject3CoachRoadConditions,
) {
  // Preserve the exact established dry-road coach path for exams/demos.
  const rainy = roadConditions?.surface === 'rain'
  const depth = rainy ? roadConditions.localWaterDepthMm : 0
  let target = 22
  let reason = ''
  let minimumBrake = 0

  const lead = observeSubject3LeadVehicle(vehicle, traffic, {
    includeStoppedPlayer: true,
  })
  if (lead) {
    const rainEnvelope = rainy
      ? rainCoachStoppingEnvelope(
          vehicle.speed,
          depth,
          lead.closingSpeedMps,
          lead.bumperGapMeters,
        )
      : undefined
    const shortGap =
      lead.bumperGapMeters < 14 ||
      (lead.timeGapSeconds > 0 && lead.timeGapSeconds < 2.2) ||
      (lead.timeToCollisionSeconds != null &&
        lead.timeToCollisionSeconds < 3.2) ||
      (rainEnvelope != null && (
        lead.bumperGapMeters < rainEnvelope.warningGapMeters ||
        (lead.timeGapSeconds > 0 &&
          lead.timeGapSeconds < RAIN_COACH_DEFENSE.followingGapSeconds)
      ))
    if (shortGap) {
      target = Math.min(target, Math.max(0, lead.leadSpeedMps * 3.6))
      reason = lead.scenario === 'sudden-brake'
        ? rainy ? '雨天前车急刹，提前制动避让' : '前车急刹，正在制动避让'
        : rainy ? '积水路面，提前制动并增大车距' : '前车距离较近，正在控制车距'

      // Match the measured lead speed before the bumpers close. A fixed
      // gentle pedal cannot safely absorb a large closing speed inside the
      // remaining gap. Keep a modest buffer and a controller reaction margin;
      // this is simulator driving control, NOT an exam-scoring threshold.
      const closingSpeed = Math.max(0, lead.closingSpeedMps)
      const availableDistance = Math.max(0.35,
        lead.bumperGapMeters - 4.5 - closingSpeed * 0.35)
      const decelerationNeeded =
        closingSpeed * closingSpeed / (2 * availableDistance)
      minimumBrake = rainEnvelope
        ? rainEnvelope.requestedBrake
        : clamp(
            decelerationNeeded /
              TRAINING_CAR_DYNAMICS.serviceBrakeAcceleration,
            0,
            0.9,
          )
    }
  }

  const rainHazardLookahead = rainy
    ? rainCoachStoppingEnvelope(vehicle.speed, depth, vehicle.speed, 40)
        .earlyHazardLookaheadMeters
    : 0
  const cutIn = observeSubject3CutInHazard(vehicle, traffic)
  if (
    cutIn?.conflict &&
    cutIn.progressDeltaMeters >= -1 &&
    cutIn.progressDeltaMeters <= 18 + rainHazardLookahead
  ) {
    target = 0
    reason = rainy
      ? '雨天电动车加塞，提前制动避让'
      : '电动车加塞冲突，正在制动避让'
    if (rainy) minimumBrake = Math.max(minimumBrake, 0.78)
  }

  const pedestrian = observeSubject3PedestrianHazard(vehicle, traffic)
  if (
    pedestrian?.conflict &&
    pedestrian.progressDeltaMeters >= -2 &&
    pedestrian.progressDeltaMeters <= 24 + rainHazardLookahead
  ) {
    target = 0
    reason = rainy ? '积水路面行人横穿，提前停车让行' : '行人横穿冲突，停车让行'
    if (rainy) minimumBrake = Math.max(minimumBrake, 0.78)
  }

  if (
    traffic.crosswalkPedestrianConflict &&
    progress >= 2420 &&
    progress <= 2605
  ) {
    target = 0
    reason = rainy ? '雨天人行横道有行人，提前停车让行' : '人行横道有行人，停车让行'
    if (rainy) minimumBrake = Math.max(minimumBrake, 0.78)
  }

  return { target, reason, minimumBrake }
}

/**
 * Deterministic Subject 3 Golden Driver.
 *
 * It emits only ordinary driver controls. Rendering, traffic collisions,
 * vehicle physics and the existing Subject 3 judge remain authoritative.
 */
export function stepSubject3Coach(
  vehicle: Subject3CoachVehicle,
  previous: Subject3CoachRuntime,
  dt: number,
  automatic: boolean,
  night: boolean,
  traffic: Readonly<Subject3TrafficState>,
  practiceSlice?: Subject3PracticeSliceId,
  roadConditions?: Subject3CoachRoadConditions,
): { runtime: Subject3CoachRuntime; command: Subject3CoachCommand } {
  const elapsedSeconds =
    previous.elapsedSeconds + Math.max(0, dt)
  const projection = projectToSubject3Route(vehicle.x, vehicle.z)
  const progress = projection.progress
  const waitingForStart = progress < 5 && elapsedSeconds < 3.3
  const stoppingForPullOver = progress >= SUBJECT3_COACH_PULL_OVER_STOP_PROGRESS
  const securedPullOver =
    stoppingForPullOver && Math.abs(vehicle.speed) < 0.05
  const defensive = defensiveTargetSpeedKmh(
    vehicle,
    traffic,
    progress,
    roadConditions,
  )
  const defensiveStopping =
    !waitingForStart &&
    !stoppingForPullOver &&
    defensive.reason.length > 0 &&
    defensive.target <= 0.1
  const defensiveLowSpeed =
    !waitingForStart &&
    !stoppingForPullOver &&
    defensive.reason.length > 0 &&
    (defensive.target <= 12 || defensive.minimumBrake >= 0.5)
  const defensiveRecovery =
    defensiveLowSpeed ||
    (previous.defensiveRecovery &&
      (defensive.reason.length > 0 || Math.abs(vehicle.speed) < 5.8))
  const runtime = {
    elapsedSeconds,
    defensiveRecovery,
  }

  const signals = subject3CoachSignalState(progress)
  const manual = automatic
    ? { gear: 1, clutch: 0 }
    : practiceSlice
      ? subject3CoachPracticeManualGearState(vehicle)
      : defensiveRecovery
        ? subject3CoachDefensiveManualGearState(
            vehicle,
            defensiveStopping,
          )
        : subject3CoachManualGearState(progress, elapsedSeconds)

  let gear = manual.gear
  let clutch = manual.clutch
  let handbrake = waitingForStart

  if (stoppingForPullOver) {
    if (!automatic) clutch = 1
    handbrake = securedPullOver
    if (securedPullOver) gear = 0
  }

  const lookAheadProgress = Math.min(
    SUBJECT3_ROUTE_LENGTH,
    progress + 6,
  )
  const target = routeTarget(
    lookAheadProgress,
    subject3CoachDesiredLateral(progress),
  )
  const desiredHeading = Math.atan2(
    target.x - vehicle.x,
    -(target.z - vehicle.z),
  )
  const headingError = normalizeHeadingDelta(
    desiredHeading - vehicle.heading,
  )
  const roadWheelTarget = clamp(
    headingError * 1.5,
    -DRIVING_RULES.steering.roadWheelMaxAngleRadians,
    DRIVING_RULES.steering.roadWheelMaxAngleRadians,
  )
  const maxSteeringWheelAngle =
    DRIVING_RULES.steering.wheelTurnsLockToLock * Math.PI
  const steeringWheelTarget =
    roadWheelTarget /
    DRIVING_RULES.steering.roadWheelMaxAngleRadians *
    maxSteeringWheelAngle

  const targetSpeedKmh =
    waitingForStart || stoppingForPullOver
      ? 0
      : defensive.target
  const speedKmh = Math.abs(vehicle.speed) * 3.6
  let throttle = 0
  let brake = 0

  if (targetSpeedKmh <= 0.1) {
    if (speedKmh > 0.15) brake = stoppingForPullOver ? 0.72 : 0.64
  } else if (!automatic && clutch === 1) {
    throttle = 0
  } else if (
    !automatic &&
    clutch === DRIVING_RULES.manualTransmission.biteClutchPosition &&
    (progress < 5 || practiceSlice != null || runtime.defensiveRecovery)
  ) {
    throttle = 0.32
  } else if (speedKmh < targetSpeedKmh - 0.6) {
    throttle = 0.34
  } else if (speedKmh > targetSpeedKmh + 0.8) {
    brake = 0.16
  } else {
    throttle = 0.08
  }

  // The speed controller uses gentle braking for normal cruise correction.
  // A live closing hazard must be allowed to demand stronger real pedal
  // input before the distance becomes unrecoverable.
  if (defensive.minimumBrake > brake) {
    brake = defensive.minimumBrake
    throttle = 0
  }

  const stability = assistCoachStability(vehicle, {
    throttle, brake, steeringWheelTarget,
  })

  const status = defensive.reason
    ? `科目三示范 · ${defensive.reason}`
    : stability.active && !waitingForStart && !stoppingForPullOver
      ? '科目三示范 · 检测到侧滑，减油并反打方向恢复车身稳定'
    : runtime.defensiveRecovery
      ? automatic
        ? '科目三示范 · 危险解除，平稳恢复行驶'
        : '科目三示范 · 危险解除，一挡重新起步并顺序升挡'
      : waitingForStart
      ? '科目三示范 · 左灯开启并观察后方，等待 3 秒后起步'
      : stoppingForPullOver
        ? securedPullOver
          ? '科目三示范 · 靠边停车完成，空挡并拉紧手刹'
          : '科目三示范 · 靠边减速停车'
        : `科目三示范 · ${eventTitle(progress)}`

  return {
    runtime,
    command: {
      throttle: stability.throttle,
      brake: stability.brake,
      clutch,
      steeringWheelTarget: stability.steeringWheelTarget,
      gear,
      engineOn: true,
      handbrake,
      seatbelt: true,
      leftIndicator: signals.left,
      rightIndicator: signals.right,
      lowBeam: night,
      highBeam: false,
      horn: false,
      // The coach continuously scans mirrors and both sides. These booleans
      // feed the same observation state used by manual look controls.
      lookLeft: true,
      lookRight: true,
      lookBack: true,
      status,
    },
  }
}

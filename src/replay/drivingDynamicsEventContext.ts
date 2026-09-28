import type {
  DrivingDynamicsEventMarker,
  DrivingDynamicsEventSample,
} from './drivingDynamicsEvents'

export const DRIVING_DYNAMICS_CONTEXT_WINDOW_SECONDS = 3

export interface DrivingDynamicsEventContextSample {
  t: number
  relativeTime: number
  project: string
  speedKmh: number
  throttlePercent?: number
  brakePercent?: number
  steeringTurns?: number
}

export interface DrivingDynamicsEventContext {
  eventId: string
  triggerTime: number
  beforeCoverageSeconds: number
  afterCoverageSeconds: number
  windowSeconds: number
  speedScaleMaxKmh: number
  steeringScaleTurns: number
  triggerSample: DrivingDynamicsEventContextSample | null
  samples: DrivingDynamicsEventContextSample[]
}

function finite(value: number | undefined): value is number {
  return value != null && Number.isFinite(value)
}

function clampPercent(value: number | undefined) {
  if (!finite(value)) return undefined
  return Math.max(0, Math.min(100, value * 100))
}

function contextSample(
  sample: DrivingDynamicsEventSample,
  triggerTime: number,
): DrivingDynamicsEventContextSample {
  return {
    t: sample.t,
    relativeTime: sample.t - triggerTime,
    project: sample.project,
    speedKmh: Math.abs(sample.speed) * 3.6,
    throttlePercent: clampPercent(sample.throttle),
    brakePercent: clampPercent(sample.brake),
    steeringTurns: finite(sample.steeringWheelAngle)
      ? sample.steeringWheelAngle / (Math.PI * 2)
      : undefined,
  }
}

function nearestToTrigger(
  samples: readonly DrivingDynamicsEventContextSample[],
) {
  if (samples.length === 0) return null

  let nearest = samples[0]
  let nearestDistance = Math.abs(nearest.relativeTime)

  for (let index = 1; index < samples.length; index += 1) {
    const distance = Math.abs(samples[index].relativeTime)
    if (distance < nearestDistance) {
      nearest = samples[index]
      nearestDistance = distance
    }
  }

  return nearest
}

export function buildDrivingDynamicsEventContext(
  input: readonly DrivingDynamicsEventSample[],
  event: DrivingDynamicsEventMarker,
  windowSeconds = DRIVING_DYNAMICS_CONTEXT_WINDOW_SECONDS,
): DrivingDynamicsEventContext {
  const window = Number.isFinite(windowSeconds)
    ? Math.max(0.1, windowSeconds)
    : DRIVING_DYNAMICS_CONTEXT_WINDOW_SECONDS
  const startTime = event.triggerTime - window
  const endTime = event.triggerTime + window

  const source = input
    .filter(sample =>
      sample.project === event.project &&
      Number.isFinite(sample.t) &&
      Number.isFinite(sample.speed) &&
      sample.t >= startTime &&
      sample.t <= endTime,
    )
    .slice()
    .sort((a, b) => a.t - b.t)

  const samples = source.map(sample => contextSample(sample, event.triggerTime))
  const first = samples[0]
  const last = samples[samples.length - 1]
  const beforeCoverageSeconds = first
    ? Math.min(window, Math.max(0, event.triggerTime - first.t))
    : 0
  const afterCoverageSeconds = last
    ? Math.min(window, Math.max(0, last.t - event.triggerTime))
    : 0

  const maximumSpeed = samples.reduce(
    (maximum, sample) => Math.max(maximum, sample.speedKmh),
    0,
  )
  const maximumSteering = samples.reduce(
    (maximum, sample) =>
      sample.steeringTurns == null
        ? maximum
        : Math.max(maximum, Math.abs(sample.steeringTurns)),
    0,
  )

  return {
    eventId: event.id,
    triggerTime: event.triggerTime,
    beforeCoverageSeconds,
    afterCoverageSeconds,
    windowSeconds: window,
    speedScaleMaxKmh: Math.max(10, Math.ceil(maximumSpeed / 10) * 10),
    steeringScaleTurns: Math.max(0.25, Math.ceil(maximumSteering * 4) / 4),
    triggerSample: nearestToTrigger(samples),
    samples,
  }
}

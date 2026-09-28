import type {
  DrivingDynamicsEventMarker,
  DrivingDynamicsEventResponseEvidence,
} from './drivingDynamicsEvents'
import type {
  DrivingDynamicsEventContext,
  DrivingDynamicsEventContextSample,
} from './drivingDynamicsEventContext'

export type DrivingDynamicsReactionStepKind =
  | 'trigger'
  | 'throttle'
  | 'brake'
  | 'stop'
  | 'speed'
  | 'steering'

export interface DrivingDynamicsReactionStep {
  kind: DrivingDynamicsReactionStepKind
  timeSeconds: number
  label: string
  detail?: string
  source: 'analyzer' | 'trajectory'
}

export interface DrivingDynamicsReactionChain {
  eventId: string
  steps: DrivingDynamicsReactionStep[]
  summary: string
  hasObservedResponse: boolean
}

function finite(value: number | undefined): value is number {
  return value != null && Number.isFinite(value)
}

function timeLabel(value: number) {
  if (Math.abs(value) < 0.05) return '0.0s'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}s`
}

function analyzerSteps(
  response: DrivingDynamicsEventResponseEvidence,
  maximumTimeSeconds: number,
): DrivingDynamicsReactionStep[] {
  const steps: DrivingDynamicsReactionStep[] = []

  if (
    finite(response.throttleReleaseSeconds) &&
    response.throttleReleaseSeconds <= maximumTimeSeconds + 1e-6
  ) {
    steps.push({
      kind: 'throttle',
      timeSeconds: response.throttleReleaseSeconds,
      label: '松油门',
      detail: '沿用教练分析器记录的油门明显回落时刻',
      source: 'analyzer',
    })
  }

  if (
    finite(response.brakeReactionSeconds) &&
    response.brakeReactionSeconds <= maximumTimeSeconds + 1e-6
  ) {
    steps.push({
      kind: 'brake',
      timeSeconds: response.brakeReactionSeconds,
      label: '开始制动',
      detail: finite(response.maximumBrake)
        ? `分析窗口内最大制动 ${Math.round(response.maximumBrake * 100)}%`
        : undefined,
      source: 'analyzer',
    })
  }

  if (
    finite(response.stopReactionSeconds) &&
    response.stopReactionSeconds <= maximumTimeSeconds + 1e-6
  ) {
    steps.push({
      kind: 'stop',
      timeSeconds: response.stopReactionSeconds,
      label: '车辆停止',
      detail: '沿用行人反应分析器记录的停车时刻',
      source: 'analyzer',
    })
  }

  return steps
}

function minimumPostTriggerSpeed(
  context: DrivingDynamicsEventContext,
) {
  const post = context.samples.filter(sample => sample.relativeTime >= 0)
  if (post.length === 0) return null

  let minimum = post[0]
  for (let index = 1; index < post.length; index += 1) {
    if (post[index].speedKmh < minimum.speedKmh) minimum = post[index]
  }
  return minimum
}

function nearestPreTriggerSteering(
  samples: readonly DrivingDynamicsEventContextSample[],
) {
  const before = samples.filter(
    sample => sample.relativeTime <= 0 && sample.steeringTurns != null,
  )
  return before.length > 0 ? before[before.length - 1] : null
}

function maximumPostTriggerSteeringChange(
  context: DrivingDynamicsEventContext,
) {
  const baseline = nearestPreTriggerSteering(context.samples)
  if (baseline?.steeringTurns == null) return null

  let best: {
    sample: DrivingDynamicsEventContextSample
    changeTurns: number
  } | null = null

  for (const sample of context.samples) {
    if (
      sample.relativeTime < 0 ||
      sample.steeringTurns == null
    ) {
      continue
    }
    const changeTurns = Math.abs(
      sample.steeringTurns - baseline.steeringTurns,
    )
    if (best == null || changeTurns > best.changeTurns) {
      best = { sample, changeTurns }
    }
  }

  return best
}

export function buildDrivingDynamicsReactionChain(
  context: DrivingDynamicsEventContext,
  event: DrivingDynamicsEventMarker,
): DrivingDynamicsReactionChain {
  const response = event.response ?? {}
  const trigger = context.triggerSample
  const steps: DrivingDynamicsReactionStep[] = [{
    kind: 'trigger',
    timeSeconds: 0,
    label: `${event.label}触发`,
    detail: trigger
      ? `触发附近最近采样 ${trigger.speedKmh.toFixed(1)} km/h`
      : undefined,
    source: 'trajectory',
  }]

  const maximumObservedResponseTime = Math.min(
    context.windowSeconds,
    context.afterCoverageSeconds,
  )
  const responseSteps = analyzerSteps(
    response,
    maximumObservedResponseTime,
  )
  steps.push(...responseSteps)

  const hasObservedStop = responseSteps.some(step => step.kind === 'stop')
  if (!hasObservedStop && trigger) {
    const minimum = minimumPostTriggerSpeed(context)
    if (
      minimum &&
      minimum.relativeTime > 0.05 &&
      trigger.speedKmh - minimum.speedKmh >= 1
    ) {
      steps.push({
        kind: 'speed',
        timeSeconds: minimum.relativeTime,
        label: `车速降至 ${minimum.speedKmh.toFixed(1)} km/h`,
        detail: `触发附近为 ${trigger.speedKmh.toFixed(1)} km/h；这里是当前 +${context.windowSeconds.toFixed(0)}s 窗口内最低记录值`,
        source: 'trajectory',
      })
    }
  }

  if (
    finite(response.maximumSteeringWheelChangeTurns) &&
    response.maximumSteeringWheelChangeTurns >= 0.05
  ) {
    const steering = maximumPostTriggerSteeringChange(context)
    if (
      steering &&
      steering.sample.relativeTime > 0.05 &&
      steering.changeTurns >= 0.05
    ) {
      steps.push({
        kind: 'steering',
        timeSeconds: steering.sample.relativeTime,
        label: `方向盘变化 ${steering.changeTurns.toFixed(2)} 圈`,
        detail: '相对触发前最近有方向盘记录的采样位置',
        source: 'trajectory',
      })
    }
  }

  steps.sort((a, b) =>
    a.timeSeconds - b.timeSeconds ||
    a.kind.localeCompare(b.kind),
  )

  const summary = steps
    .map(step => step.kind === 'trigger'
      ? step.label
      : `${timeLabel(step.timeSeconds)} ${step.label}`)
    .join(' → ')

  return {
    eventId: event.id,
    steps,
    summary,
    hasObservedResponse: steps.some(step => step.kind !== 'trigger'),
  }
}

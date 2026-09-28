import type {
  DrivingDynamicsEventContext,
} from './drivingDynamicsEventContext'
import type {
  DrivingDynamicsEventKind,
  DrivingDynamicsEventMarker,
} from './drivingDynamicsEvents'

export type DrivingDynamicsSingleEventSummarySectionKind =
  | 'event'
  | 'response'
  | 'result'
  | 'gaps'

export interface DrivingDynamicsSingleEventSummarySection {
  kind: DrivingDynamicsSingleEventSummarySectionKind
  title: string
  text: string
  details: string[]
}

export interface DrivingDynamicsSingleEventSummary {
  eventId: string
  sections: DrivingDynamicsSingleEventSummarySection[]
}

const HAZARD_FACT_PREFIXES = [
  '最小时距 ',
  '触发时距 ',
  '最近前车 ',
  '最近距离 ',
  '切入位置 ',
  '进入冲突区 ',
]

function finite(value: number | undefined): value is number {
  return value != null && Number.isFinite(value)
}

function splitHazardFacts(summary: string) {
  return summary
    .split(' · ')
    .map(part => part.trim())
    .filter(part =>
      HAZARD_FACT_PREFIXES.some(prefix => part.startsWith(prefix)),
    )
}

function responseDetails(event: DrivingDynamicsEventMarker) {
  const response = event.response
  const details: string[] = []

  if (finite(response.throttleReleaseSeconds)) {
    details.push(
      `触发后 ${response.throttleReleaseSeconds.toFixed(1)} 秒记录到松油门。`,
    )
  }

  if (finite(response.brakeReactionSeconds)) {
    details.push(
      `触发后 ${response.brakeReactionSeconds.toFixed(1)} 秒记录到开始制动。`,
    )
  }

  if (
    event.kind === 'cut-in' &&
    finite(response.maximumSteeringWheelChangeTurns)
  ) {
    details.push(
      `记录到方向盘变化 ${response.maximumSteeringWheelChangeTurns.toFixed(2)} 圈。`,
    )
  }

  if (finite(response.maximumBrake) && response.maximumBrake > 0) {
    details.push(
      `分析窗口内最大制动输入 ${Math.round(response.maximumBrake * 100)}%。`,
    )
  }

  return details
}

function minimumPostTriggerSpeedKmh(
  context: DrivingDynamicsEventContext,
) {
  const post = context.samples.filter(sample => sample.relativeTime >= 0)
  if (post.length === 0) return undefined

  let minimum = post[0].speedKmh
  for (let index = 1; index < post.length; index += 1) {
    minimum = Math.min(minimum, post[index].speedKmh)
  }
  return minimum
}

function resultDetails(
  event: DrivingDynamicsEventMarker,
  context: DrivingDynamicsEventContext,
) {
  const details: string[] = []
  const triggerSpeed = context.triggerSample?.speedKmh
  const minimumSpeed = minimumPostTriggerSpeedKmh(context)

  if (finite(triggerSpeed)) {
    details.push(
      `触发附近最近速度采样为 ${triggerSpeed.toFixed(1)} km/h。`,
    )
  }

  if (finite(minimumSpeed)) {
    details.push(
      `触发后最多 ${context.windowSeconds.toFixed(0)} 秒内最低记录车速为 ${minimumSpeed.toFixed(1)} km/h。`,
    )
  }

  if (finite(event.response.stopReactionSeconds)) {
    const outsideVisibleWindow =
      event.response.stopReactionSeconds > context.afterCoverageSeconds + 1e-6 ||
      event.response.stopReactionSeconds > context.windowSeconds + 1e-6
    details.push(
      outsideVisibleWindow
        ? `分析器记录到触发后 ${event.response.stopReactionSeconds.toFixed(1)} 秒车辆停止；该时刻超出当前可见曲线覆盖。`
        : `分析器记录到触发后 ${event.response.stopReactionSeconds.toFixed(1)} 秒车辆停止。`,
    )
  }

  return details
}

function expectedMissingEvidence(
  event: DrivingDynamicsEventMarker,
  context: DrivingDynamicsEventContext,
) {
  const gaps: string[] = []
  const response = event.response

  if (!finite(response.throttleReleaseSeconds)) {
    gaps.push('未记录到明确的松油门时刻。')
  }
  if (!finite(response.brakeReactionSeconds)) {
    gaps.push('未记录到明确的开始制动时刻。')
  }

  if (
    event.kind === 'pedestrian' &&
    !finite(response.stopReactionSeconds)
  ) {
    gaps.push('未记录到车辆停止时刻。')
  }

  if (
    event.kind === 'cut-in' &&
    !finite(response.maximumSteeringWheelChangeTurns)
  ) {
    gaps.push('未记录到结构化方向盘变化量。')
  }

  if (context.samples.length === 0) {
    gaps.push('事件附近没有可用的同项目连续轨迹采样。')
    return gaps
  }

  if (context.triggerSample == null) {
    gaps.push('没有可用于触发附近状态的速度采样。')
  }

  if (context.beforeCoverageSeconds < context.windowSeconds - 0.05) {
    gaps.push(
      `触发前轨迹仅覆盖 ${context.beforeCoverageSeconds.toFixed(1)} 秒，少于计划的 ${context.windowSeconds.toFixed(0)} 秒。`,
    )
  }

  if (context.afterCoverageSeconds < context.windowSeconds - 0.05) {
    gaps.push(
      `触发后轨迹仅覆盖 ${context.afterCoverageSeconds.toFixed(1)} 秒，少于计划的 ${context.windowSeconds.toFixed(0)} 秒。`,
    )
  }

  const hasThrottle = context.samples.some(
    sample => sample.throttlePercent != null,
  )
  const hasBrake = context.samples.some(
    sample => sample.brakePercent != null,
  )
  if (!hasThrottle) gaps.push('当前上下文没有油门连续采样。')
  if (!hasBrake) gaps.push('当前上下文没有制动连续采样。')

  if (
    event.kind === 'cut-in' &&
    !context.samples.some(sample => sample.steeringTurns != null)
  ) {
    gaps.push('当前上下文没有方向盘连续采样。')
  }

  return gaps
}

function section(
  kind: DrivingDynamicsSingleEventSummarySectionKind,
  title: string,
  text: string,
  details: string[],
): DrivingDynamicsSingleEventSummarySection {
  return { kind, title, text, details }
}

export function buildDrivingDynamicsSingleEventSummary(
  event: DrivingDynamicsEventMarker,
  context: DrivingDynamicsEventContext,
): DrivingDynamicsSingleEventSummary {
  const hazardFacts = splitHazardFacts(event.summary)
  const responses = responseDetails(event)
  const results = resultDetails(event, context)
  const gaps = expectedMissingEvidence(event, context)

  return {
    eventId: event.id,
    sections: [
      section(
        'event',
        '发生了什么',
        `${event.label}被现有教练分析器识别为本次风险事件。`,
        hazardFacts.length > 0
          ? hazardFacts.map(fact => `${fact}。`)
          : ['当前事件没有额外的距离/时距摘要证据。'],
      ),
      section(
        'response',
        '你做了什么',
        responses.length > 0
          ? '以下内容来自已记录的驾驶输入或既有教练分析结果。'
          : '当前没有足够的结构化响应节点可自动归纳。',
        responses.length > 0
          ? responses
          : ['请结合下方连续曲线查看实际操作变化。'],
      ),
      section(
        'result',
        '车辆结果如何',
        results.length > 0
          ? '这里只陈述事件后可观测到的车辆状态。'
          : '当前没有足够的车辆结果数据可自动归纳。',
        results.length > 0
          ? results
          : ['不补造缺失的速度或停车结果。'],
      ),
      section(
        'gaps',
        '哪些证据缺失',
        gaps.length > 0
          ? '以下项目没有被当前数据完整记录；缺失不等于没有采取相应动作。'
          : '当前摘要所需的核心证据均有记录。',
        gaps.length > 0
          ? gaps
          : ['这不代表所有驾驶行为都被完整观测，只表示本摘要没有发现核心证据缺口。'],
      ),
    ],
  }
}

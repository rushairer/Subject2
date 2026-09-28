import type {
  DrivingDynamicsHazardComparisonGroup,
  DrivingDynamicsHazardComparisonItem,
} from './drivingDynamicsHazardComparison'

export type DrivingDynamicsHazardInsightKind =
  | 'coverage'
  | 'reaction'
  | 'vehicle-state'

export interface DrivingDynamicsHazardInsight {
  id: string
  kind: DrivingDynamicsHazardInsightKind
  text: string
  eventIds: string[]
}

export interface DrivingDynamicsHazardInsightGroup {
  kind: DrivingDynamicsHazardComparisonGroup['kind']
  label: string
  glyph: string
  insights: DrivingDynamicsHazardInsight[]
}

interface MetricDefinition {
  key:
    | 'throttleReleaseSeconds'
    | 'brakeReactionSeconds'
    | 'stopReactionSeconds'
    | 'triggerSpeedKmh'
    | 'minimumPostTriggerSpeedKmh'
    | 'steeringChangeTurns'
  label: string
  category: 'reaction' | 'vehicle-state'
  minimumDelta: number
  format: (value: number) => string
  difference: (
    current: number,
    previous: number,
    currentIndex: number,
    previousIndex: number,
  ) => string
}

const reactionMetrics: MetricDefinition[] = [
  {
    key: 'brakeReactionSeconds',
    label: '开始制动',
    category: 'reaction',
    minimumDelta: 0.1,
    format: value => `${value.toFixed(1)} 秒`,
    difference: (current, previous, currentIndex, previousIndex) => {
      const delta = Math.abs(current - previous)
      const direction = current < previous ? '早' : '晚'
      return `第 ${currentIndex} 次记录到开始制动比第 ${previousIndex} 次${direction} ${delta.toFixed(1)} 秒。`
    },
  },
  {
    key: 'throttleReleaseSeconds',
    label: '松油门',
    category: 'reaction',
    minimumDelta: 0.1,
    format: value => `${value.toFixed(1)} 秒`,
    difference: (current, previous, currentIndex, previousIndex) => {
      const delta = Math.abs(current - previous)
      const direction = current < previous ? '早' : '晚'
      return `第 ${currentIndex} 次记录到松油门比第 ${previousIndex} 次${direction} ${delta.toFixed(1)} 秒。`
    },
  },
  {
    key: 'stopReactionSeconds',
    label: '车辆停止',
    category: 'reaction',
    minimumDelta: 0.1,
    format: value => `${value.toFixed(1)} 秒`,
    difference: (current, previous, currentIndex, previousIndex) => {
      const delta = Math.abs(current - previous)
      const direction = current < previous ? '早' : '晚'
      return `第 ${currentIndex} 次记录到车辆停止比第 ${previousIndex} 次${direction} ${delta.toFixed(1)} 秒。`
    },
  },
]

const stateMetrics: MetricDefinition[] = [
  {
    key: 'triggerSpeedKmh',
    label: '触发附近速度',
    category: 'vehicle-state',
    minimumDelta: 1,
    format: value => `${value.toFixed(1)} km/h`,
    difference: (current, previous, currentIndex, previousIndex) => {
      const delta = Math.abs(current - previous)
      const direction = current < previous ? '低' : '高'
      return `第 ${currentIndex} 次触发附近速度比第 ${previousIndex} 次${direction} ${delta.toFixed(1)} km/h。`
    },
  },
  {
    key: 'minimumPostTriggerSpeedKmh',
    label: '触发后 ≤3 秒最低车速',
    category: 'vehicle-state',
    minimumDelta: 1,
    format: value => `${value.toFixed(1)} km/h`,
    difference: (current, previous, currentIndex, previousIndex) => {
      const delta = Math.abs(current - previous)
      const direction = current < previous ? '低' : '高'
      return `第 ${currentIndex} 次触发后 ≤3 秒最低车速比第 ${previousIndex} 次${direction} ${delta.toFixed(1)} km/h。`
    },
  },
  {
    key: 'steeringChangeTurns',
    label: '方向盘变化',
    category: 'vehicle-state',
    minimumDelta: 0.05,
    format: value => `${value.toFixed(2)} 圈`,
    difference: (current, previous, currentIndex, previousIndex) => {
      const delta = Math.abs(current - previous)
      const direction = current < previous ? '少' : '多'
      return `第 ${currentIndex} 次记录到的方向盘变化比第 ${previousIndex} 次${direction} ${delta.toFixed(2)} 圈。`
    },
  },
]

function finite(value: number | undefined): value is number {
  return value != null && Number.isFinite(value)
}

function metricValue(
  item: DrivingDynamicsHazardComparisonItem,
  metric: MetricDefinition,
) {
  const value = item[metric.key]
  return finite(value) ? value : undefined
}

function coverageInsight(
  group: DrivingDynamicsHazardComparisonGroup,
  metric: MetricDefinition,
): DrivingDynamicsHazardInsight | null {
  const recorded = group.items.filter(item =>
    finite(item[metric.key]),
  ).length

  if (recorded === 0 || recorded === group.items.length) return null

  return {
    id: `${group.kind}:coverage:${metric.key}`,
    kind: 'coverage',
    text: `${group.items.length} 次${group.label}中，${recorded} 次记录到${metric.label}数据，${group.items.length - recorded} 次没有该项证据。`,
    eventIds: group.items.map(item => item.id),
  }
}

function adjacentMetricInsight(
  previous: DrivingDynamicsHazardComparisonItem,
  current: DrivingDynamicsHazardComparisonItem,
  previousIndex: number,
  currentIndex: number,
  metric: MetricDefinition,
): DrivingDynamicsHazardInsight | null {
  const previousValue = metricValue(previous, metric)
  const currentValue = metricValue(current, metric)

  if (previousValue == null && currentValue == null) return null

  if (previousValue == null && currentValue != null) {
    return {
      id: `${current.id}:${metric.key}:appeared`,
      kind: metric.category,
      text: `第 ${currentIndex} 次记录到${metric.label} ${metric.format(currentValue)}；第 ${previousIndex} 次没有该项证据。`,
      eventIds: [previous.id, current.id],
    }
  }

  if (previousValue != null && currentValue == null) {
    return {
      id: `${current.id}:${metric.key}:missing`,
      kind: metric.category,
      text: `第 ${currentIndex} 次没有记录到${metric.label}数据；第 ${previousIndex} 次记录为 ${metric.format(previousValue)}。`,
      eventIds: [previous.id, current.id],
    }
  }

  if (
    previousValue == null ||
    currentValue == null ||
    Math.abs(currentValue - previousValue) < metric.minimumDelta
  ) {
    return null
  }

  return {
    id: `${current.id}:${metric.key}:delta`,
    kind: metric.category,
    text: metric.difference(
      currentValue,
      previousValue,
      currentIndex,
      previousIndex,
    ),
    eventIds: [previous.id, current.id],
  }
}

function buildGroupInsights(
  group: DrivingDynamicsHazardComparisonGroup,
): DrivingDynamicsHazardInsight[] {
  const insights: DrivingDynamicsHazardInsight[] = []

  for (const metric of reactionMetrics) {
    const coverage = coverageInsight(group, metric)
    if (coverage) insights.push(coverage)
  }

  for (let index = 1; index < group.items.length; index += 1) {
    const previous = group.items[index - 1]
    const current = group.items[index]

    const reaction = reactionMetrics
      .map(metric =>
        adjacentMetricInsight(
          previous,
          current,
          index,
          index + 1,
          metric,
        ),
      )
      .find((insight): insight is DrivingDynamicsHazardInsight =>
        insight != null,
      )

    if (reaction) insights.push(reaction)

    const state = stateMetrics
      .map(metric =>
        adjacentMetricInsight(
          previous,
          current,
          index,
          index + 1,
          metric,
        ),
      )
      .find((insight): insight is DrivingDynamicsHazardInsight =>
        insight != null,
      )

    if (state) insights.push(state)
  }

  return insights
}

export function buildDrivingDynamicsHazardInsights(
  groups: readonly DrivingDynamicsHazardComparisonGroup[],
): DrivingDynamicsHazardInsightGroup[] {
  return groups.map(group => ({
    kind: group.kind,
    label: group.label,
    glyph: group.glyph,
    insights: buildGroupInsights(group),
  }))
}

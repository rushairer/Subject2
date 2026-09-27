import {
  SUBJECT3_EVENTS,
  poseAtRouteDistance,
  projectToSubject3Route,
  type Subject3RouteEvent,
} from './subject3Route'

export type Subject3PracticeSliceId =
  | 'intersection-turns'
  | 'lane-change'
  | 'pull-over'

export interface Subject3PracticeSliceDefinition {
  id: Subject3PracticeSliceId
  title: string
  summary: string
  startEventId: string
  endEventId: string
  approachMeters: number
}

export interface ResolvedSubject3PracticeSlice extends Subject3PracticeSliceDefinition {
  startEventIndex: number
  endEventIndex: number
  startEvent: Subject3RouteEvent
  endEvent: Subject3RouteEvent
  startDistance: number
  endDistance: number
}

export const SUBJECT3_PRACTICE_SLICES: readonly Subject3PracticeSliceDefinition[] = [
  {
    id: 'intersection-turns',
    title: '路口左右转弯',
    summary: '从左转弯前开始，连续训练观察、转向灯提前量、减速、左转和右转。',
    startEventId: 'left-turn-1',
    endEventId: 'right-turn-1',
    approachMeters: 100,
  },
  {
    id: 'lane-change',
    title: '变更车道',
    summary: '从变道项目开始前进入道路，训练后方观察、左转向灯提前量和完整变道。',
    startEventId: 'lane-change',
    endEventId: 'lane-change',
    approachMeters: 90,
  },
  {
    id: 'pull-over',
    title: '靠边停车',
    summary: '从靠边停车项目前进入道路，训练右侧/后方观察、右转向灯、边距和稳定停车。',
    startEventId: 'pull-over',
    endEventId: 'pull-over',
    approachMeters: 110,
  },
]

const DEFINITION_BY_ID = new Map(
  SUBJECT3_PRACTICE_SLICES.map(slice => [slice.id, slice] as const),
)

export function isSubject3PracticeSliceId(value: string): value is Subject3PracticeSliceId {
  return DEFINITION_BY_ID.has(value as Subject3PracticeSliceId)
}

export function subject3PracticeSliceTitle(value: string | undefined) {
  if (!value || !isSubject3PracticeSliceId(value)) return null
  return DEFINITION_BY_ID.get(value)?.title ?? null
}

function eventIndexById(id: string) {
  return SUBJECT3_EVENTS.findIndex(event => event.id === id)
}

export function subject3PracticeSliceById(
  id: Subject3PracticeSliceId,
): ResolvedSubject3PracticeSlice {
  const definition = DEFINITION_BY_ID.get(id)
  if (!definition) throw new Error(`Unknown Subject 3 practice slice: ${id}`)

  const startEventIndex = eventIndexById(definition.startEventId)
  const endEventIndex = eventIndexById(definition.endEventId)
  if (startEventIndex < 0 || endEventIndex < startEventIndex) {
    throw new Error(`Invalid Subject 3 practice event range: ${id}`)
  }

  const startEvent = SUBJECT3_EVENTS[startEventIndex]
  const endEvent = SUBJECT3_EVENTS[endEventIndex]
  const startDistance = Math.max(0, startEvent.start - definition.approachMeters)

  return {
    ...definition,
    startEventIndex,
    endEventIndex,
    startEvent,
    endEvent,
    startDistance,
    endDistance: endEvent.end,
  }
}

export function subject3PracticeStartPose(id: Subject3PracticeSliceId) {
  const slice = subject3PracticeSliceById(id)
  const pose = poseAtRouteDistance(slice.startDistance)
  return {
    x: pose.x,
    z: pose.z,
    heading: pose.heading,
  }
}

export function subject3PracticeRuntimeSeed(id: Subject3PracticeSliceId) {
  const slice = subject3PracticeSliceById(id)
  return {
    eventIndex: slice.startEventIndex,
    progress: slice.startDistance,
  }
}

export function subject3PracticeInitialStatus(id: Subject3PracticeSliceId) {
  const slice = subject3PracticeSliceById(id)
  return `科目三专项 · ${slice.title} · 下一项目：${slice.startEvent.title}`
}

export function subject3PracticeCompletionStatus(id: Subject3PracticeSliceId) {
  const slice = subject3PracticeSliceById(id)
  return `科目三专项完成 · ${slice.title}`
}

export function isSubject3PracticeSliceComplete(
  id: Subject3PracticeSliceId,
  completedEventId: string,
) {
  return subject3PracticeSliceById(id).endEventId === completedEventId
}

export function subject3PracticeStartProjection(id: Subject3PracticeSliceId) {
  const pose = subject3PracticeStartPose(id)
  return projectToSubject3Route(pose.x, pose.z)
}

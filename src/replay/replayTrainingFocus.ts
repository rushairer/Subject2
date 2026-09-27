import type { Subject3PracticeSliceId } from '../subject3/subject3Practice'

export interface ReplayFocusInfraction {
  id: string
  title: string
  points: number
  fatal?: boolean
  t?: number
  project?: string
}

export type ReplayTrainingProjectId =
  | 'reverse-parking'
  | 'side-parking'
  | 'slope-start'
  | 'curve-driving'
  | 'right-angle'
  | 'subject3'

export type ReplayHabitId =
  | 'safety-routine'
  | 'observation-signal'
  | 'speed-flow'
  | 'vehicle-control'
  | 'space-position'
  | 'hazard-response'
  | 'maneuver-completion'

interface ReplayHabitDefinition {
  id: ReplayHabitId
  title: string
  summary: string
  practice: string
}

export interface ReplayTrainingFocus extends ReplayHabitDefinition {
  count: number
  fatalCount: number
  totalPoints: number
  firstTime: number
  evidenceTitles: string[]
  representative: ReplayFocusInfraction
  recommendedProject: ReplayTrainingProjectId | null
  recommendedSubject3Practice: Subject3PracticeSliceId | null
}

const HABITS: Record<ReplayHabitId, ReplayHabitDefinition> = {
  'safety-routine': {
    id: 'safety-routine',
    title: '安全检查与起停流程',
    summary: '起步、停车或夜间驾驶前后的固定检查链条还不够稳定。',
    practice: '把安全带、灯光/观察、挡位、驻车制动等动作固化成固定顺序，每次起步和停车都按同一流程执行。',
  },
  'observation-signal': {
    id: 'observation-signal',
    title: '观察与信号习惯',
    summary: '观察、打灯和车辆动作之间的先后关系需要进一步固定。',
    practice: '坚持“先观察 → 再打灯 → 保持必要提前量 → 最后开始转向/变道”，动作完成后及时检查信号状态。',
  },
  'speed-flow': {
    id: 'speed-flow',
    title: '速度与行驶节奏',
    summary: '速度控制、项目连续性或时间节奏出现了可重复的问题。',
    practice: '提前收油和制动，把速度降到可连续控制的范围；避免进入项目后才急刹，也避免无效停车和长时间犹豫。',
  },
  'vehicle-control': {
    id: 'vehicle-control',
    title: '动力、挡位与方向控制',
    summary: '动力衔接、挡位选择或方向修正还没有形成稳定的协调。',
    practice: '先把低速动力和方向修正练稳定，再提高节奏；C1 重点固定离合结合点和顺序换挡，方向盘使用小幅连续修正。',
  },
  'space-position': {
    id: 'space-position',
    title: '车身位置与边线余量',
    summary: '车身、车轮与道路/库位边界之间的空间余量判断不足。',
    practice: '建立固定参照点并持续观察两侧边线；降低接近边界时的车速和打轮幅度，给车身回正与后轮轨迹留出余量。',
  },
  'hazard-response': {
    id: 'hazard-response',
    title: '冲突识别与让行',
    summary: '对行人、车辆或障碍物冲突的识别和处置偏晚。',
    practice: '把视线提前放到冲突区域，先减速建立制动余量；出现实际通行冲突时优先停车让行，不依赖最后一刻急转避让。',
  },
  'maneuver-completion': {
    id: 'maneuver-completion',
    title: '项目动作完整性',
    summary: '规定路线、控制线或完整动作闭环存在遗漏。',
    practice: '把每个项目拆成明确的进入条件、关键动作和结束条件，确认当前阶段真正完成后再进入下一步。',
  },
}

function matchesId(id: string, base: string) {
  return id === base || id.startsWith(`${base}-`)
}

const TRAINING_PROJECTS = new Set<ReplayTrainingProjectId>([
  'reverse-parking',
  'side-parking',
  'slope-start',
  'curve-driving',
  'right-angle',
  'subject3',
])

export function replayTrainingProject(
  project: string | undefined,
): ReplayTrainingProjectId | null {
  if (project == null) return null
  if (TRAINING_PROJECTS.has(project as ReplayTrainingProjectId)) {
    return project as ReplayTrainingProjectId
  }

  if (project.startsWith('transition:')) {
    const [, , to] = project.split(':')
    if (TRAINING_PROJECTS.has(to as ReplayTrainingProjectId)) {
      return to as ReplayTrainingProjectId
    }
  }

  return null
}

export function replaySubject3Practice(
  item: Pick<ReplayFocusInfraction, 'id' | 'project'>,
): Subject3PracticeSliceId | null {
  if (item.project !== 'subject3') return null

  if (/^subject3-lane-change-/.test(item.id)) return 'lane-change'
  if (/^subject3-pull-over-/.test(item.id)) return 'pull-over'
  if (/^subject3-(?:left-turn|right-turn)-/.test(item.id)) return 'intersection-turns'

  return null
}

export function replayHabitForInfraction(item: ReplayFocusInfraction): ReplayHabitId {
  const { id, title } = item

  if (id.includes('collision') || id.endsWith('-yield') || title.includes('礼让')) {
    return 'hazard-response'
  }

  if (
    id === 'seatbelt-not-fastened' ||
    id === 'subject3-seatbelt' ||
    id === 'parking-brake' ||
    matchesId(id, 'slope-no-parking-brake') ||
    id === 'subject3-night-lights-off' ||
    id === 'subject3-light-test'
  ) {
    return 'safety-routine'
  }

  if (
    id.endsWith('-signal') ||
    id.endsWith('-left-signal') ||
    id.endsWith('-right-signal') ||
    id.endsWith('-signal-lead') ||
    id.endsWith('-right-signal-lead') ||
    id.endsWith('-observation') ||
    id.endsWith('-right-observation') ||
    matchesId(id, 'side-parking-exit-signal') ||
    matchesId(id, 'right-angle-no-signal') ||
    matchesId(id, 'right-angle-signal-not-cancelled')
  ) {
    return 'observation-signal'
  }

  if (
    id === 'speed-control' ||
    id.endsWith('-speed') ||
    id.includes('timeout') ||
    matchesId(id, 'reverse-parking-stop') ||
    matchesId(id, 'side-parking-stop') ||
    matchesId(id, 'curve-stop') ||
    matchesId(id, 'right-angle-stop')
  ) {
    return 'speed-flow'
  }

  if (
    id.startsWith('engine-stall-') ||
    id.includes('rollback') ||
    id.endsWith('-gear') ||
    id.endsWith('-skip-gear') ||
    id.endsWith('-high-gear-duration') ||
    id.endsWith('-direction') ||
    matchesId(id, 'curve-reverse')
  ) {
    return 'vehicle-control'
  }

  if (
    id.includes('body-out') ||
    id.includes('line-contact') ||
    id.includes('wheel-line') ||
    id.includes('wheel-out') ||
    id === 'subject3-road-boundary' ||
    id.includes('right-gap') ||
    id.includes('stop-longitudinal') ||
    id.includes('distance-') ||
    title.includes('边缘线') ||
    title.includes('车身距离')
  ) {
    return 'space-position'
  }

  return 'maneuver-completion'
}

function compareRepresentative(a: ReplayFocusInfraction, b: ReplayFocusInfraction) {
  const fatalDelta = Number(Boolean(b.fatal)) - Number(Boolean(a.fatal))
  if (fatalDelta !== 0) return fatalDelta
  if (b.points !== a.points) return b.points - a.points
  return (a.t ?? Number.POSITIVE_INFINITY) - (b.t ?? Number.POSITIVE_INFINITY)
}

export function buildReplayTrainingFocus(
  infractions: readonly ReplayFocusInfraction[],
  limit = 3,
): ReplayTrainingFocus[] {
  if (limit <= 0 || infractions.length === 0) return []

  const groups = new Map<ReplayHabitId, ReplayFocusInfraction[]>()

  for (const item of infractions) {
    const habit = replayHabitForInfraction(item)
    const group = groups.get(habit)
    if (group) group.push(item)
    else groups.set(habit, [item])
  }

  return Array.from(groups.entries())
    .map(([habitId, items]) => {
      const definition = HABITS[habitId]
      const representative = [...items].sort(compareRepresentative)[0]
      const finiteTimes = items
        .map(item => item.t)
        .filter((time): time is number => time != null && Number.isFinite(time))
      const evidenceTitles = Array.from(new Set(items.map(item => item.title))).slice(0, 3)

      return {
        ...definition,
        count: items.length,
        fatalCount: items.filter(item => item.fatal).length,
        totalPoints: items.reduce((sum, item) => sum + Math.max(0, item.points), 0),
        firstTime: finiteTimes.length > 0 ? Math.min(...finiteTimes) : Number.POSITIVE_INFINITY,
        evidenceTitles,
        representative,
        recommendedProject: replayTrainingProject(representative.project),
        recommendedSubject3Practice: replaySubject3Practice(representative),
      }
    })
    .sort((a, b) => {
      if (b.fatalCount !== a.fatalCount) return b.fatalCount - a.fatalCount
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
      if (b.count !== a.count) return b.count - a.count
      if (a.firstTime !== b.firstTime) return a.firstTime - b.firstTime
      return a.title.localeCompare(b.title, 'zh-CN')
    })
    .slice(0, limit)
}

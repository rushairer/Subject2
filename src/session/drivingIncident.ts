import type { CollisionKind } from '../sim/collisionResponse'
import type { Subject2ProjectId } from '../subject2/courseStartPoses'

export type CollisionObjectRole =
  | 'traffic-cone'
  | 'sign-post'
  | 'course-gate-post'
  | 'tree'
  | 'building'
  | 'vehicle'
  | 'pedestrian'
  | 'scooter'
  | 'pole'

export interface CollisionIncidentContext {
  kind: CollisionKind
  object: CollisionObjectRole
  label: string
  course?: Subject2ProjectId
}

export interface DrivingIncident {
  id: string
  title: string
  category: 'collision'
  collision: CollisionIncidentContext
  t?: number
  x?: number
  z?: number
  project?: string
}

export type DrivingIncidentDraft = Pick<DrivingIncident, 'id' | 'title' | 'category' | 'collision'>

const SUBJECT2_PROJECT_LABELS: Record<Subject2ProjectId, string> = {
  'reverse-parking': '倒车入库',
  'side-parking': '侧方停车',
  'slope-start': '坡道定点停车和起步',
  'curve-driving': '曲线行驶',
  'right-angle': '直角转弯',
}

export function subject2CollisionIncident({
  id,
  kind,
  object,
  label,
  course,
  title,
}: {
  id: string
  kind: CollisionKind
  object: CollisionObjectRole
  label: string
  course: Subject2ProjectId
  title?: string
}): DrivingIncidentDraft {
  return {
    id,
    title: title ?? `${SUBJECT2_PROJECT_LABELS[course]}时撞到${label}`,
    category: 'collision',
    collision: {
      kind,
      object,
      label,
      course,
    },
  }
}

export function subject2CourseGateIncident({
  id,
  course,
}: {
  id: string
  course: Subject2ProjectId
}): DrivingIncidentDraft {
  return subject2CollisionIncident({
    id,
    kind: 'pole',
    object: 'course-gate-post',
    label: '项目入口立杆',
    course,
    title: `连续考试连接道路撞到${SUBJECT2_PROJECT_LABELS[course]}入口立杆`,
  })
}

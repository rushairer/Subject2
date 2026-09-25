import { CURVE_START } from './CurveDrivingCourse'

export type Subject2ProjectId =
  | 'reverse-parking'
  | 'side-parking'
  | 'slope-start'
  | 'curve-driving'
  | 'right-angle'

export interface CourseStartPose {
  x: number
  z: number
  heading: number
}

/**
 * Canonical spawn poses for each Subject 2 project.
 *
 * Keep these poses in one place so rendering, exam logic, replay regression
 * tests, and future continuous-course routing cannot silently disagree.
 */
export const SUBJECT2_START_POSES: Record<Subject2ProjectId, CourseStartPose> = {
  'reverse-parking': { x: 0, z: 5.7, heading: Math.PI },
  'side-parking': { x: 0, z: 8.2, heading: 0 },
  'slope-start': { x: 0.4, z: 11, heading: 0 },
  'curve-driving': { x: CURVE_START.x, z: CURVE_START.z, heading: 0 },
  'right-angle': { x: 0, z: 7.2, heading: 0 },
}

export function subject2StartPose(project?: string): CourseStartPose | undefined {
  if (!project || !Object.prototype.hasOwnProperty.call(SUBJECT2_START_POSES, project)) return undefined
  return SUBJECT2_START_POSES[project as Subject2ProjectId]
}

import type { ReactElement } from 'react'
import { sceneYawFromHeading } from '../sim/vehicleFrame'
import { CurveDrivingCourse } from './CurveDrivingCourse'
import { ReverseParkingCourse } from './ReverseParkingCourse'
import { RightAngleCourse } from './RightAngleCourse'
import { SideParkingCourse } from './SideParkingCourse'
import { SlopeStartCourse } from './SlopeStartCourse'
import {
  SUBJECT2_EXAM_PLACEMENTS,
  subject2ExamTransitions,
  type Subject2Transition,
} from './subject2ExamLayout'
import type { CoursePlacement } from './courseTransform'

function PlacedCourse({
  placement,
  children,
}: {
  placement: CoursePlacement
  children: ReactElement
}) {
  return <group
    position={[placement.x, 0, placement.z]}
    rotation-y={sceneYawFromHeading(placement.heading)}
  >
    {children}
  </group>
}

function TransitionRoad({ transition }: { transition: Subject2Transition }) {
  const dx = transition.end.x - transition.start.x
  const dz = transition.end.z - transition.start.z
  const length = Math.hypot(dx, dz)
  const heading = Math.atan2(dx, -dz)
  const x = (transition.start.x + transition.end.x) / 2
  const z = (transition.start.z + transition.end.z) / 2
  return <group position={[x, 0, z]} rotation-y={sceneYawFromHeading(heading)}>
    <mesh rotation-x={-Math.PI / 2} position-y={0.006}>
      <planeGeometry args={[4.2, length]} />
      <meshStandardMaterial color="#3c4144" roughness={1} />
    </mesh>
    <mesh rotation-x={-Math.PI / 2} position={[-2.02, 0.016, 0]}>
      <planeGeometry args={[0.12, length]} />
      <meshBasicMaterial color="#f3d34a" />
    </mesh>
    <mesh rotation-x={-Math.PI / 2} position={[2.02, 0.016, 0]}>
      <planeGeometry args={[0.12, length]} />
      <meshBasicMaterial color="#f3d34a" />
    </mesh>
  </group>
}

export function Subject2ExamCourse({ automatic }: { automatic: boolean }): ReactElement {
  const transitions = subject2ExamTransitions(automatic)
  return <group>
    {transitions.map(transition => (
      <TransitionRoad key={`${transition.from}-${transition.to}`} transition={transition} />
    ))}
    <PlacedCourse placement={SUBJECT2_EXAM_PLACEMENTS['reverse-parking']}>
      <ReverseParkingCourse />
    </PlacedCourse>
    {!automatic && <PlacedCourse placement={SUBJECT2_EXAM_PLACEMENTS['slope-start']}>
      <SlopeStartCourse />
    </PlacedCourse>}
    <PlacedCourse placement={SUBJECT2_EXAM_PLACEMENTS['side-parking']}>
      <SideParkingCourse />
    </PlacedCourse>
    <PlacedCourse placement={SUBJECT2_EXAM_PLACEMENTS['curve-driving']}>
      <CurveDrivingCourse />
    </PlacedCourse>
    <PlacedCourse placement={SUBJECT2_EXAM_PLACEMENTS['right-angle']}>
      <RightAngleCourse />
    </PlacedCourse>
  </group>
}

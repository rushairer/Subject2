import type { MutableRefObject, ReactElement } from 'react'
import type { Vehicle } from '../sim/vehicleCollision'
import type { VehicleAudioState } from '../audio/vehicleAudio'
import { sceneYawFromHeading } from '../sim/vehicleFrame'
import { CurveDrivingCourse } from './CurveDrivingCourse'
import { ReverseParkingCourse } from './ReverseParkingCourse'
import { RightAngleCourse } from './RightAngleCourse'
import { SideParkingCourse } from './SideParkingCourse'
import { SlopeStartCourse } from './SlopeStartCourse'
import {
  SUBJECT2_EXAM_PLACEMENTS,
  subject2ExamSequence,
  subject2ExamTransitions,
  subject2ExamWorldStartPose,
  type Subject2Transition,
} from './subject2ExamLayout'
import type { Subject2ProjectId } from './courseStartPoses'
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


function CourseGate({
  project,
  active,
}: {
  project: Subject2ProjectId
  active: boolean
}) {
  const pose = subject2ExamWorldStartPose(project)
  const postColor = active ? '#65d9ff' : '#53758f'
  const markerColor = active ? '#f5d06f' : '#7f8b94'
  return <group
    position={[pose.x, 0, pose.z]}
    rotation-y={sceneYawFromHeading(pose.heading)}
  >
    {[-2.25, 2.25].map(x => (
      <mesh key={x} position={[x, 1.05, 0]}>
        <cylinderGeometry args={[0.07, 0.09, 2.1, 10]} />
        <meshStandardMaterial color={postColor} emissive={active ? postColor : '#000000'} emissiveIntensity={active ? 0.18 : 0} />
      </mesh>
    ))}
    <mesh position={[0, 2.05, 0]}>
      <boxGeometry args={[4.5, 0.12, 0.12]} />
      <meshStandardMaterial color={postColor} emissive={active ? postColor : '#000000'} emissiveIntensity={active ? 0.18 : 0} />
    </mesh>
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.022, 0]}>
      <planeGeometry args={[1.25, 0.34]} />
      <meshBasicMaterial color={markerColor} />
    </mesh>
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
    <mesh rotation-x={-Math.PI / 2} position-y={0.006} receiveShadow>
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

export function Subject2ExamCourse({
  automatic,
  activeProject,
  vehicle,
  audioContext,
  audioState,
}: {
  automatic: boolean
  activeProject: Subject2ProjectId
  vehicle?: MutableRefObject<Vehicle>
  audioContext?: AudioContext | null
  audioState?: VehicleAudioState
}): ReactElement {
  const transitions = subject2ExamTransitions(automatic)
  const sequence = subject2ExamSequence(automatic)
  return <group>
    {sequence.map(project => (
      <CourseGate
        key={`gate-${project}`}
        project={project}
        active={project === activeProject}
      />
    ))}
    {transitions.map(transition => (
      <TransitionRoad key={`${transition.from}-${transition.to}`} transition={transition} />
    ))}
    <PlacedCourse placement={SUBJECT2_EXAM_PLACEMENTS['reverse-parking']}>
      <ReverseParkingCourse
        vehicle={vehicle}
        placement={SUBJECT2_EXAM_PLACEMENTS['reverse-parking']}
        audioContext={audioContext}
        audioState={audioState}
      />
    </PlacedCourse>
    {!automatic && <PlacedCourse placement={SUBJECT2_EXAM_PLACEMENTS['slope-start']}>
      <SlopeStartCourse
        vehicle={vehicle}
        placement={SUBJECT2_EXAM_PLACEMENTS['slope-start']}
        audioContext={audioContext}
        audioState={audioState}
      />
    </PlacedCourse>}
    <PlacedCourse placement={SUBJECT2_EXAM_PLACEMENTS['side-parking']}>
      <SideParkingCourse
        vehicle={vehicle}
        placement={SUBJECT2_EXAM_PLACEMENTS['side-parking']}
        audioContext={audioContext}
        audioState={audioState}
      />
    </PlacedCourse>
    <PlacedCourse placement={SUBJECT2_EXAM_PLACEMENTS['curve-driving']}>
      <CurveDrivingCourse />
    </PlacedCourse>
    <PlacedCourse placement={SUBJECT2_EXAM_PLACEMENTS['right-angle']}>
      <RightAngleCourse
        vehicle={vehicle}
        placement={SUBJECT2_EXAM_PLACEMENTS['right-angle']}
        audioContext={audioContext}
        audioState={audioState}
      />
    </PlacedCourse>
  </group>
}

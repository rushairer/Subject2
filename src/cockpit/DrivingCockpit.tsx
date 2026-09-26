import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, type MutableRefObject, type ReactElement } from 'react'
import * as THREE from 'three'
import { TRAINING_CAR } from '../sim/vehicleDimensions'
import { ackermannFrontAngles } from '../sim/wheelContact'
import { SantanaBody } from './SantanaBody'
import { VehicleMirrors } from './VehicleMirrors'
import { CarContactShadow } from './DrivingLighting'
import { CabinInterior } from './CabinInterior'
import { Dashboard } from './Dashboard'
import { Rod, Upholstery } from './interiorParts'

export interface CockpitVehicleState {
  speed: number
  steering: number
  steeringWheelAngle: number
  throttle: number
  brake: number
  clutch: number
  gear: number
  engineOn: boolean
  engineRpm: number
  handbrake: boolean
  leftIndicator: boolean
  rightIndicator: boolean
  hazard: boolean
  lowBeam: boolean
  highBeam: boolean
  horn: boolean
  seatbelt: boolean
}

function gearPosition(gear: number): [number, number] {
  if (gear === -1) return [0.11, -0.07]
  if (gear === 0) return [0, 0]
  const positions: Record<number, [number, number]> = {
    1: [-0.1, 0.07],
    2: [-0.1, -0.07],
    3: [0, 0.07],
    4: [0, -0.07],
    5: [0.1, 0.07],
  }
  return positions[gear] ?? [0, 0]
}


function RoadWheel({
  x,
  z,
  steerRef,
  spinRef,
}: {
  x: number
  z: number
  steerRef?: React.RefObject<THREE.Group | null>
  spinRef: React.RefObject<THREE.Group | null>
}) {
  return <group ref={steerRef} position={[x, TRAINING_CAR.wheelRadiusMeters, z]}>
    <group rotation-z={Math.PI / 2}>
      <group ref={spinRef}>
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[TRAINING_CAR.wheelRadiusMeters, TRAINING_CAR.wheelRadiusMeters, TRAINING_CAR.tireWidthMeters, 28]} />
          <meshStandardMaterial color="#111315" roughness={0.86} />
        </mesh>
        {[-1, 1].map(side => <group key={side} position={[0, side * (TRAINING_CAR.tireWidthMeters / 2 + 0.004), 0]}>
          <mesh><cylinderGeometry args={[0.205, 0.205, 0.012, 40]} /><meshStandardMaterial color="#abb2af" metalness={0.7} roughness={0.3} /></mesh>
          {Array.from({ length: 8 }, (_, i) => {
            const a = i * Math.PI / 4
            return <mesh key={i} position={[Math.cos(a) * 0.145, side * 0.009, Math.sin(a) * 0.145]} rotation-y={-a}>
              <boxGeometry args={[0.068, 0.012, 0.035]} /><meshStandardMaterial color="#333b3a" roughness={0.5} />
            </mesh>
          })}
          <mesh position={[0, side * 0.013, 0]}><cylinderGeometry args={[0.065, 0.065, 0.015, 24]} /><meshStandardMaterial color="#6f7775" metalness={0.65} roughness={0.3} /></mesh>
        </group>)}
      </group>
    </group>
  </group>
}

function Pedal({ x, active, wide = false }: { x: number; active: number; wide?: boolean }) {
  return <group position={[x, 0.38, -0.72]} rotation-x={-0.42 - active * 0.28}>
    <mesh>
      <boxGeometry args={[wide ? 0.18 : 0.13, 0.035, 0.28]} />
      <meshStandardMaterial color="#252a2f" metalness={0.35} roughness={0.5} />
    </mesh>
    <mesh position={[0, 0.022, -0.04]}>
      <boxGeometry args={[wide ? 0.13 : 0.09, 0.012, 0.14]} />
      <meshStandardMaterial color="#565d63" metalness={0.65} roughness={0.35} />
    </mesh>
  </group>
}

export function DrivingCockpit({
  vehicle,
  showClutch,
  automatic,
}: {
  vehicle: MutableRefObject<CockpitVehicleState>
  showClutch: boolean
  automatic: boolean
}): ReactElement {
  const root = useRef<THREE.Group>(null)
  const steeringWheel = useRef<THREE.Group>(null)
  const gearLever = useRef<THREE.Group>(null)
  const leftHeadlight = useRef<THREE.SpotLight>(null)
  const rightHeadlight = useRef<THREE.SpotLight>(null)
  const headlightTarget = useRef<THREE.Object3D>(null)
  const wheelSpin = useRef(0)
  const frontLeftSteer = useRef<THREE.Group>(null)
  const frontRightSteer = useRef<THREE.Group>(null)
  const frontLeftSpin = useRef<THREE.Group>(null)
  const frontRightSpin = useRef<THREE.Group>(null)
  const rearLeftSpin = useRef<THREE.Group>(null)
  const rearRightSpin = useRef<THREE.Group>(null)


  useEffect(() => {
    const target = headlightTarget.current
    if (!target) return
    if (leftHeadlight.current) leftHeadlight.current.target = target
    if (rightHeadlight.current) rightHeadlight.current.target = target
  }, [])

  useFrame((_, delta) => {
    const v = vehicle.current
    wheelSpin.current += (v.speed * delta) / TRAINING_CAR.wheelRadiusMeters
    if (steeringWheel.current) steeringWheel.current.rotation.z = -v.steeringWheelAngle
    const frontAngles = ackermannFrontAngles(v.steering)
    if (frontLeftSteer.current) frontLeftSteer.current.rotation.y = -frontAngles.left
    if (frontRightSteer.current) frontRightSteer.current.rotation.y = -frontAngles.right
    for (const spin of [frontLeftSpin.current, frontRightSpin.current, rearLeftSpin.current, rearRightSpin.current]) {
      if (spin) spin.rotation.y = wheelSpin.current
    }

    if (gearLever.current) {
      const [gx, gz] = automatic
        ? (v.gear === -1 ? [-0.08, -0.05] : v.gear === 0 ? [0, 0] : [0.08, 0.05])
        : gearPosition(v.gear)
      gearLever.current.rotation.x = -0.08 + gz * 3.2
      gearLever.current.rotation.z = -gx * 3.2
    }

    const lightIntensity = v.highBeam ? 220 : v.lowBeam ? 95 : 0
    for (const light of [leftHeadlight.current, rightHeadlight.current]) {
      if (!light) continue
      light.intensity = lightIntensity
      light.distance = v.highBeam ? 110 : 62
      light.angle = v.highBeam ? 0.17 : 0.28
    }
  })

  const v = vehicle.current

  return <group ref={root}>
    <CarContactShadow />
    <SantanaBody headlights={v.lowBeam || v.highBeam} braking={v.brake > 0.05} />

    <RoadWheel x={-TRAINING_CAR.trackWidthMeters / 2} z={-TRAINING_CAR.frontAxleFromCenterMeters} steerRef={frontLeftSteer} spinRef={frontLeftSpin} />
    <RoadWheel x={TRAINING_CAR.trackWidthMeters / 2} z={-TRAINING_CAR.frontAxleFromCenterMeters} steerRef={frontRightSteer} spinRef={frontRightSpin} />
    <RoadWheel x={-TRAINING_CAR.trackWidthMeters / 2} z={TRAINING_CAR.rearAxleFromCenterMeters} spinRef={rearLeftSpin} />
    <RoadWheel x={TRAINING_CAR.trackWidthMeters / 2} z={TRAINING_CAR.rearAxleFromCenterMeters} spinRef={rearRightSpin} />

    <Dashboard vehicle={vehicle} automatic={automatic} />
    <Rod from={[-0.43, 0.90, -0.73]} to={[-0.43, 0.965, -0.42]} radius={0.037} />
    <Rod from={[-0.48, 0.98, -0.48]} to={[-0.66, 1.00, -0.49]} radius={0.009} />
    <Rod from={[-0.38, 0.98, -0.48]} to={[-0.24, 1.00, -0.49]} radius={0.009} />
    <group name="经典四辐方向盘" position={[-0.43, 0.98, -0.40]} rotation-x={-0.38}>
      <group ref={steeringWheel}>
        <mesh castShadow receiveShadow><torusGeometry args={[0.18, 0.018, 12, 64]} /><meshStandardMaterial color="#303735" roughness={0.7} /></mesh>
        {[-1, 1].flatMap(side => [-1, 1].map(vertical => <group key={`${side}-${vertical}`} rotation-z={side * vertical * 0.19}>
          <Upholstery position={[side * 0.105, vertical * 0.052, 0]} size={[0.12, 0.034, 0.028]} color="#343c39" radius={0.01} />
        </group>))}
        <Upholstery position={[0, -0.008, 0.022]} size={[0.155, 0.096, 0.047]} color={v.horn ? '#515d53' : '#414b46'} radius={0.023} />
        <mesh position={[0, 0, 0.05]}><circleGeometry args={[0.023, 32]} /><meshStandardMaterial color="#1f302a" /></mesh>
        <mesh position={[0, 0, 0.051]}><torusGeometry args={[0.022, 0.002, 6, 32]} /><meshStandardMaterial color="#b8c0b4" metalness={0.5} /></mesh>
        <Rod from={[-0.012, 0.013, 0.052]} to={[0, -0.005, 0.052]} radius={0.002} color="#c2c9bc" />
        <Rod from={[0, -0.005, 0.052]} to={[0.012, 0.013, 0.052]} radius={0.002} color="#c2c9bc" />
        <Rod from={[-0.016, 0, 0.052]} to={[-0.009, -0.013, 0.052]} radius={0.002} color="#c2c9bc" />
        <Rod from={[-0.009, -0.013, 0.052]} to={[0, -0.005, 0.052]} radius={0.002} color="#c2c9bc" />
        <Rod from={[0, -0.005, 0.052]} to={[0.009, -0.013, 0.052]} radius={0.002} color="#c2c9bc" />
        <Rod from={[0.009, -0.013, 0.052]} to={[0.016, 0, 0.052]} radius={0.002} color="#c2c9bc" />
      </group>
    </group>

    <group ref={gearLever} position={[0.33, 0.64, -0.12]}>
      <mesh position={[0, 0.11, 0]} rotation-x={0.08}>
        <cylinderGeometry args={[0.018, 0.024, 0.28, 12]} />
        <meshStandardMaterial color="#a3a8aa" metalness={0.72} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.25, 0]}>
        <sphereGeometry args={[0.07, 18, 12]} />
        <meshStandardMaterial color="#111416" roughness={0.35} />
      </mesh>
    </group>
    <mesh position={[0.33, 0.61, -0.12]}>
      <boxGeometry args={[0.34, 0.04, 0.34]} />
      <meshStandardMaterial color="#181d21" roughness={0.55} />
    </mesh>

    {showClutch && <Pedal x={-0.57} active={v.clutch} />}
    <Pedal x={-0.39} active={v.brake} wide />
    <Pedal x={-0.2} active={v.throttle} />

    <VehicleMirrors />

    <CabinInterior seatbelt={v.seatbelt} />

    <object3D ref={headlightTarget} position={[0, 0.45, -40]} />
    <spotLight ref={leftHeadlight} position={[-0.56, 0.68, -2.16]} color="#fff8df" intensity={0} angle={0.28} penumbra={0.55} distance={62} />
    <spotLight ref={rightHeadlight} position={[0.56, 0.68, -2.16]} color="#fff8df" intensity={0} angle={0.28} penumbra={0.55} distance={62} />
  </group>
}

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type MutableRefObject, type ReactElement } from 'react'
import * as THREE from 'three'
import { TRAINING_CAR } from '../sim/vehicleDimensions'

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

interface MirrorRig {
  camera: THREE.PerspectiveCamera
  target: THREE.WebGLRenderTarget
  anchor: React.RefObject<THREE.Object3D | null>
  surface: React.RefObject<THREE.Mesh | null>
}

function createMirrorTarget(width: number, height: number) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: true,
    stencilBuffer: false,
  })
  target.texture.colorSpace = THREE.SRGBColorSpace
  target.texture.wrapS = THREE.RepeatWrapping
  target.texture.repeat.x = -1
  target.texture.offset.x = 1
  target.texture.generateMipmaps = false
  target.texture.minFilter = THREE.LinearFilter
  target.texture.magFilter = THREE.LinearFilter
  return target
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


function createInstrumentDisplay() {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 240
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  return { canvas, texture }
}


function SteeringSpoke({
  angle,
  length,
  width,
  offset = 0.13,
}: {
  angle: number
  length: number
  width: number
  offset?: number
}) {
  const x = Math.sin(angle) * (offset + length / 2)
  const y = Math.cos(angle) * (offset + length / 2)
  return <group position={[x, y, 0]} rotation-z={-angle}>
    <mesh>
      <boxGeometry args={[width, length, 0.045]} />
      <meshStandardMaterial color="#25292d" metalness={0.18} roughness={0.42} />
    </mesh>
    <mesh position={[0, 0, 0.026]}>
      <boxGeometry args={[Math.max(0.018, width - 0.035), Math.max(0.05, length - 0.035), 0.012]} />
      <meshStandardMaterial color="#33383d" metalness={0.32} roughness={0.3} />
    </mesh>
  </group>
}

function WheelButtonCluster({ side }: { side: 'left' | 'right' }) {
  const x = side === 'left' ? -0.14 : 0.14
  return <group position={[x, 0.015, 0.042]}>
    <mesh>
      <boxGeometry args={[0.105, 0.067, 0.028]} />
      <meshStandardMaterial color="#111416" metalness={0.2} roughness={0.36} />
    </mesh>
    {[-0.026, 0.026].map((dx, index) => (
      <mesh key={index} position={[dx, 0, 0.018]}>
        <boxGeometry args={[0.029, 0.028, 0.009]} />
        <meshStandardMaterial color="#3e464d" metalness={0.24} roughness={0.33} />
      </mesh>
    ))}
  </group>
}

function SteeringColumn() {
  return <group position={[-0.43, 1.08, -0.57]} rotation-x={-0.38}>
    <mesh position={[0, 0, -0.12]}>
      <cylinderGeometry args={[0.055, 0.072, 0.26, 20]} />
      <meshStandardMaterial color="#15191c" metalness={0.26} roughness={0.48} />
    </mesh>
    <mesh position={[0, 0, -0.27]}>
      <cylinderGeometry args={[0.08, 0.1, 0.12, 20]} />
      <meshStandardMaterial color="#22282d" metalness={0.18} roughness={0.5} />
    </mesh>

    <group position={[-0.14, 0.015, -0.16]} rotation-z={0.2}>
      <mesh rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.014, 0.018, 0.22, 12]} />
        <meshStandardMaterial color="#252b30" metalness={0.35} roughness={0.38} />
      </mesh>
      <mesh position={[-0.12, 0, 0]}>
        <boxGeometry args={[0.075, 0.028, 0.03]} />
        <meshStandardMaterial color="#1a1f23" roughness={0.42} />
      </mesh>
    </group>

    <group position={[0.14, 0.015, -0.16]} rotation-z={-0.2}>
      <mesh rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.014, 0.018, 0.22, 12]} />
        <meshStandardMaterial color="#252b30" metalness={0.35} roughness={0.38} />
      </mesh>
      <mesh position={[0.12, 0, 0]}>
        <boxGeometry args={[0.075, 0.028, 0.03]} />
        <meshStandardMaterial color="#1a1f23" roughness={0.42} />
      </mesh>
    </group>
  </group>
}


function ackermannFrontAngles(virtualAngle: number) {
  if (Math.abs(virtualAngle) < 0.0001) return { left: 0, right: 0 }

  const wheelbase = TRAINING_CAR.wheelbaseMeters
  const halfTrack = TRAINING_CAR.trackWidthMeters / 2
  const sign = Math.sign(virtualAngle)
  const radius = wheelbase / Math.tan(Math.abs(virtualAngle))
  const inner = Math.atan(wheelbase / Math.max(0.15, radius - halfTrack))
  const outer = Math.atan(wheelbase / (radius + halfTrack))

  return sign > 0
    ? { left: outer, right: inner }
    : { left: -inner, right: -outer }
}

const MIRROR_SURFACE_POSE = {
  // Derived from the current left-hand-drive eye point, each physical mirror
  // position, and the known-good rear camera directions from 0c206fff.
  // The surface normal bisects the eye ray and the desired reflected scene ray.
  center: {
    pitch: THREE.MathUtils.degToRad(6),
    yaw: THREE.MathUtils.degToRad(-16.5),
  },
  left: {
    pitch: THREE.MathUtils.degToRad(-6),
    yaw: THREE.MathUtils.degToRad(22),
  },
  right: {
    pitch: THREE.MathUtils.degToRad(-3.5),
    yaw: THREE.MathUtils.degToRad(-31),
  },
} as const

function roundedMirrorShape(width: number, height: number, radius: number) {
  const shape = new THREE.Shape()
  const x = -width / 2
  const y = -height / 2
  shape.moveTo(x + radius, y)
  shape.lineTo(x + width - radius, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + radius)
  shape.lineTo(x + width, y + height - radius)
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  shape.lineTo(x + radius, y + height)
  shape.quadraticCurveTo(x, y + height, x, y + height - radius)
  shape.lineTo(x, y + radius)
  shape.quadraticCurveTo(x, y, x + radius, y)
  return shape
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
  return <group ref={steerRef} position={[x, 0.38, z]}>
    <group rotation-z={Math.PI / 2}>
      <group ref={spinRef}>
        <mesh>
          <cylinderGeometry args={[TRAINING_CAR.wheelRadiusMeters, TRAINING_CAR.wheelRadiusMeters, 0.19, 28]} />
          <meshStandardMaterial color="#111315" roughness={0.86} />
        </mesh>
        <mesh position={[0, 0.101, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.018, 24]} />
          <meshStandardMaterial color="#6f777d" metalness={0.68} roughness={0.28} />
        </mesh>
        <mesh position={[0, 0.112, 0]}>
          <cylinderGeometry args={[0.055, 0.055, 0.022, 20]} />
          <meshStandardMaterial color="#252a2e" metalness={0.5} roughness={0.3} />
        </mesh>
      </group>
    </group>
  </group>
}

function VehicleGlass({
  position,
  rotation = [0, 0, 0],
  size,
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
  size: [number, number]
}) {
  return <mesh position={position} rotation={rotation}>
    <planeGeometry args={size} />
    <meshPhysicalMaterial
      color="#7b9daf"
      transparent
      opacity={0.12}
      roughness={0.12}
      metalness={0}
      transmission={0.18}
      side={THREE.DoubleSide}
      depthWrite={false}
    />
  </mesh>
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
  const { gl, scene } = useThree()
  const root = useRef<THREE.Group>(null)
  const steeringWheel = useRef<THREE.Group>(null)
  const gearLever = useRef<THREE.Group>(null)
  const speedNeedle = useRef<THREE.Group>(null)
  const leftSignal = useRef<THREE.Mesh>(null)
  const rightSignal = useRef<THREE.Mesh>(null)
  const lowBeamLamp = useRef<THREE.Mesh>(null)
  const highBeamLamp = useRef<THREE.Mesh>(null)
  const hornPad = useRef<THREE.Mesh>(null)
  const leftHeadlight = useRef<THREE.SpotLight>(null)
  const rightHeadlight = useRef<THREE.SpotLight>(null)
  const headlightTarget = useRef<THREE.Object3D>(null)
  const mirrorAccumulator = useRef(0)
  const displayAccumulator = useRef(0)
  const wheelSpin = useRef(0)
  const frontLeftSteer = useRef<THREE.Group>(null)
  const frontRightSteer = useRef<THREE.Group>(null)
  const frontLeftSpin = useRef<THREE.Group>(null)
  const frontRightSpin = useRef<THREE.Group>(null)
  const rearLeftSpin = useRef<THREE.Group>(null)
  const rearRightSpin = useRef<THREE.Group>(null)
  const leftMirrorShape = useMemo(() => roundedMirrorShape(0.53, 0.225, 0.065), [])
  const rightMirrorShape = useMemo(() => roundedMirrorShape(0.53, 0.225, 0.065), [])
  const centerMirrorShape = useMemo(() => roundedMirrorShape(0.69, 0.18, 0.035), [])

  const centerAnchor = useRef<THREE.Object3D>(null)
  const leftAnchor = useRef<THREE.Object3D>(null)
  const rightAnchor = useRef<THREE.Object3D>(null)
  const centerSurface = useRef<THREE.Mesh>(null)
  const leftSurface = useRef<THREE.Mesh>(null)
  const rightSurface = useRef<THREE.Mesh>(null)

  const instrumentDisplay = useMemo(() => createInstrumentDisplay(), [])

  const mirrors = useMemo(() => {
    const centerTarget = createMirrorTarget(512, 190)
    const leftTarget = createMirrorTarget(384, 192)
    const rightTarget = createMirrorTarget(384, 192)
    return {
      centerTarget,
      leftTarget,
      rightTarget,
      centerCamera: new THREE.PerspectiveCamera(42, 512 / 190, 0.08, 260),
      leftCamera: new THREE.PerspectiveCamera(56, 2.15, 0.08, 220),
      rightCamera: new THREE.PerspectiveCamera(56, 2.15, 0.08, 220),
    }
  }, [])

  useEffect(() => {
    const target = headlightTarget.current
    if (!target) return
    if (leftHeadlight.current) leftHeadlight.current.target = target
    if (rightHeadlight.current) rightHeadlight.current.target = target
  }, [])

  useEffect(() => {
    return () => {
      mirrors.centerTarget.dispose()
      mirrors.leftTarget.dispose()
      mirrors.rightTarget.dispose()
      instrumentDisplay.texture.dispose()
    }
  }, [instrumentDisplay, mirrors])

  useFrame(({ clock }, delta) => {
    const v = vehicle.current
    displayAccumulator.current += delta
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

    if (speedNeedle.current) {
      const kmh = Math.min(140, Math.abs(v.speed) * 3.6)
      speedNeedle.current.rotation.z = 2.15 - (kmh / 140) * 4.3
    }

    const blink = Math.sin(clock.elapsedTime * Math.PI * 2.2) > 0
    if (leftSignal.current) {
      const material = leftSignal.current.material as THREE.MeshBasicMaterial
      material.color.set((v.leftIndicator || v.hazard) && blink ? '#53f28b' : '#284637')
    }
    if (rightSignal.current) {
      const material = rightSignal.current.material as THREE.MeshBasicMaterial
      material.color.set((v.rightIndicator || v.hazard) && blink ? '#53f28b' : '#284637')
    }
    if (lowBeamLamp.current) {
      const material = lowBeamLamp.current.material as THREE.MeshBasicMaterial
      material.color.set(v.lowBeam ? '#79d7ff' : '#233745')
    }
    if (highBeamLamp.current) {
      const material = highBeamLamp.current.material as THREE.MeshBasicMaterial
      material.color.set(v.highBeam ? '#6fb8ff' : '#233745')
    }
    if (hornPad.current) {
      const material = hornPad.current.material as THREE.MeshStandardMaterial
      material.emissive.set(v.horn ? '#7b1e16' : '#000000')
      material.emissiveIntensity = v.horn ? 1.2 : 0
    }
    if (displayAccumulator.current >= 0.08) {
      displayAccumulator.current = 0
      const ctx = instrumentDisplay.canvas.getContext('2d')
      if (ctx) {
        const width = instrumentDisplay.canvas.width
        const height = instrumentDisplay.canvas.height
        ctx.clearRect(0, 0, width, height)
        ctx.fillStyle = '#071018'
        ctx.fillRect(0, 0, width, height)
        ctx.fillStyle = '#152a38'
        ctx.fillRect(0, height - 8, width, 8)
        ctx.font = '700 108px system-ui, sans-serif'
        ctx.fillStyle = '#eef8ff'
        ctx.textAlign = 'left'
        ctx.fillText(String(Math.round(Math.abs(v.speed) * 3.6)).padStart(2, '0'), 34, 128)
        ctx.font = '600 28px system-ui, sans-serif'
        ctx.fillStyle = '#86a7ba'
        ctx.fillText('km/h', 42, 174)

        const gear = v.gear === -1 ? 'R' : v.gear === 0 ? 'N' : automatic ? 'D' : String(v.gear)
        ctx.font = '800 94px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillStyle = '#69d7ff'
        ctx.fillText(gear, 370, 132)

        ctx.font = '700 23px system-ui, sans-serif'
        ctx.textAlign = 'left'
        ctx.fillStyle = v.engineOn ? '#70dfa0' : '#53636d'
        ctx.fillText(v.engineOn ? `RPM ${Math.round(v.engineRpm)}` : 'ENGINE', 465, 56)
        ctx.fillStyle = v.handbrake ? '#ff7368' : '#53636d'
        ctx.fillText('P BRAKE', 465, 91)
        const wheelTurns = Math.abs(v.steeringWheelAngle) / (Math.PI * 2)
        ctx.font = '700 20px system-ui, sans-serif'
        ctx.fillStyle = Math.abs(v.steeringWheelAngle) < 0.03 ? '#7f929e' : '#f0c86d'
        ctx.fillText(
          Math.abs(v.steeringWheelAngle) < 0.03
            ? 'STEER 0'
            : `STEER ${v.steeringWheelAngle < 0 ? 'L' : 'R'} ${wheelTurns.toFixed(2)}T`,
          465,
          196,
        )
        ctx.fillStyle = v.seatbelt ? '#70dfa0' : '#ff7368'
        ctx.fillText(v.seatbelt ? 'BELT OK' : 'BELT', 465, 126)
        ctx.fillStyle = v.highBeam ? '#70b7ff' : v.lowBeam ? '#72d7ff' : '#53636d'
        ctx.fillText(v.highBeam ? 'HIGH' : v.lowBeam ? 'LOW' : 'LIGHT', 465, 161)
        instrumentDisplay.texture.needsUpdate = true
      }
    }

    const lightIntensity = v.highBeam ? 220 : v.lowBeam ? 95 : 0
    for (const light of [leftHeadlight.current, rightHeadlight.current]) {
      if (!light) continue
      light.intensity = lightIntensity
      light.distance = v.highBeam ? 110 : 62
      light.angle = v.highBeam ? 0.17 : 0.28
    }
  })

  useFrame((_, delta) => {
    mirrorAccumulator.current += delta
    if (mirrorAccumulator.current < 1 / 30) return
    mirrorAccumulator.current = 0

    const rigs: MirrorRig[] = [
      { camera: mirrors.centerCamera, target: mirrors.centerTarget, anchor: centerAnchor, surface: centerSurface },
      { camera: mirrors.leftCamera, target: mirrors.leftTarget, anchor: leftAnchor, surface: leftSurface },
      { camera: mirrors.rightCamera, target: mirrors.rightTarget, anchor: rightAnchor, surface: rightSurface },
    ]

    const surfaces = [centerSurface.current, leftSurface.current, rightSurface.current]
    surfaces.forEach(surface => {
      if (surface) surface.visible = false
    })

    const previousTarget = gl.getRenderTarget()
    const previousAutoClear = gl.autoClear
    gl.autoClear = true

    try {
      for (const rig of rigs) {
        const anchor = rig.anchor.current
        if (!anchor) continue
        anchor.getWorldPosition(rig.camera.position)
        anchor.getWorldQuaternion(rig.camera.quaternion)
        rig.camera.updateMatrixWorld(true)

        gl.setRenderTarget(rig.target)
        gl.clear(true, true, true)
        gl.render(scene, rig.camera)
      }
    } finally {
      gl.setRenderTarget(previousTarget)
      gl.autoClear = previousAutoClear
      surfaces.forEach(surface => {
        if (surface) surface.visible = true
      })
    }
  }, -1)

  const v = vehicle.current

  return <group ref={root}>
    <mesh position={[0, 0.52, 0]}>
      <boxGeometry args={[1.82, 0.3, 3.8]} />
      <meshStandardMaterial color="#151c22" metalness={0.28} roughness={0.48} />
    </mesh>
    <mesh position={[0, 0.7, -1.35]} rotation-x={-0.035}>
      <boxGeometry args={[1.7, 0.2, 1.32]} />
      <meshStandardMaterial color="#1b252d" metalness={0.32} roughness={0.4} />
    </mesh>
    <mesh position={[0, 0.68, 1.55]}>
      <boxGeometry args={[1.72, 0.22, 0.9]} />
      <meshStandardMaterial color="#182128" metalness={0.3} roughness={0.44} />
    </mesh>

    <RoadWheel x={-0.78} z={-1.4} steerRef={frontLeftSteer} spinRef={frontLeftSpin} />
    <RoadWheel x={0.78} z={-1.4} steerRef={frontRightSteer} spinRef={frontRightSpin} />
    <RoadWheel x={-0.78} z={1.42} spinRef={rearLeftSpin} />
    <RoadWheel x={0.78} z={1.42} spinRef={rearRightSpin} />

    <mesh position={[0, 1.02, -0.56]}>
      <boxGeometry args={[1.72, 0.26, 0.36]} />
      <meshStandardMaterial color="#1a2026" roughness={0.52} />
    </mesh>

    <VehicleGlass position={[0, 1.415, -0.735]} rotation={[-0.145, 0, 0]} size={[1.66, 0.72]} />
    <VehicleGlass position={[-0.862, 1.42, 0.14]} rotation={[0, Math.PI / 2, 0]} size={[1.34, 0.58]} />
    <VehicleGlass position={[0.862, 1.42, 0.14]} rotation={[0, Math.PI / 2, 0]} size={[1.34, 0.58]} />

    <mesh position={[-0.842, 1.415, -0.685]} rotation-x={-0.145}>
      <boxGeometry args={[0.082, 0.79, 0.095]} />
      <meshStandardMaterial color="#171d22" metalness={0.14} roughness={0.5} />
    </mesh>
    <mesh position={[0.842, 1.415, -0.685]} rotation-x={-0.145}>
      <boxGeometry args={[0.082, 0.79, 0.095]} />
      <meshStandardMaterial color="#171d22" metalness={0.14} roughness={0.5} />
    </mesh>
    <mesh position={[0, 1.765, -0.665]} rotation-x={-0.145}>
      <boxGeometry args={[1.74, 0.085, 0.105]} />
      <meshStandardMaterial color="#151b20" roughness={0.46} />
    </mesh>
    <mesh position={[0, 1.07, -0.785]} rotation-x={-0.145}>
      <boxGeometry args={[1.72, 0.08, 0.105]} />
      <meshStandardMaterial color="#171d22" roughness={0.48} />
    </mesh>
    <mesh position={[-0.855, 1.4, 0.67]}>
      <boxGeometry args={[0.075, 0.72, 0.1]} />
      <meshStandardMaterial color="#171d22" metalness={0.14} roughness={0.5} />
    </mesh>
    <mesh position={[0.855, 1.4, 0.67]}>
      <boxGeometry args={[0.075, 0.72, 0.1]} />
      <meshStandardMaterial color="#171d22" metalness={0.14} roughness={0.5} />
    </mesh>
    <mesh position={[-0.84, 1.73, 0.12]}>
      <boxGeometry args={[0.075, 0.08, 1.58]} />
      <meshStandardMaterial color="#161c21" roughness={0.46} />
    </mesh>
    <mesh position={[0.84, 1.73, 0.12]}>
      <boxGeometry args={[0.075, 0.08, 1.58]} />
      <meshStandardMaterial color="#161c21" roughness={0.46} />
    </mesh>

    <mesh position={[0, 1.74, 0.83]}>
      <boxGeometry args={[1.75, 0.09, 0.1]} />
      <meshStandardMaterial color="#151b20" roughness={0.46} />
    </mesh>

    <mesh position={[-0.88, 0.94, 0.12]}>
      <boxGeometry args={[0.09, 0.48, 1.72]} />
      <meshStandardMaterial color="#1a2228" metalness={0.18} roughness={0.48} />
    </mesh>
    <mesh position={[0.88, 0.94, 0.12]}>
      <boxGeometry args={[0.09, 0.48, 1.72]} />
      <meshStandardMaterial color="#1a2228" metalness={0.18} roughness={0.48} />
    </mesh>
    <mesh position={[-0.43, 1.19, -0.76]} rotation-x={-0.18}>
      <boxGeometry args={[0.55, 0.18, 0.08]} />
      <meshStandardMaterial color="#080b0e" roughness={0.25} />
    </mesh>
    <mesh position={[0.25, 1.16, -0.775]} rotation-x={-0.18}>
      <planeGeometry args={[0.58, 0.215]} />
      <meshBasicMaterial map={instrumentDisplay.texture} toneMapped={false} />
    </mesh>

    <group ref={speedNeedle} position={[-0.43, 1.205, -0.805]}>
      <mesh position={[0, 0.07, 0]}>
        <boxGeometry args={[0.018, 0.15, 0.012]} />
        <meshBasicMaterial color="#ff6c5c" />
      </mesh>
    </group>
    <mesh position={[-0.43, 1.205, -0.812]}>
      <circleGeometry args={[0.13, 32]} />
      <meshStandardMaterial color="#121a20" emissive={v.engineOn ? '#0d1e28' : '#000000'} emissiveIntensity={1.2} />
    </mesh>

    <mesh ref={leftSignal} position={[-0.63, 1.205, -0.82]}>
      <circleGeometry args={[0.025, 16]} />
      <meshBasicMaterial color="#284637" />
    </mesh>
    <mesh ref={rightSignal} position={[-0.22, 1.205, -0.82]}>
      <circleGeometry args={[0.025, 16]} />
      <meshBasicMaterial color="#284637" />
    </mesh>
    <mesh ref={lowBeamLamp} position={[-0.34, 1.145, -0.82]}>
      <circleGeometry args={[0.018, 16]} />
      <meshBasicMaterial color="#233745" />
    </mesh>
    <mesh ref={highBeamLamp} position={[-0.29, 1.145, -0.82]}>
      <circleGeometry args={[0.018, 16]} />
      <meshBasicMaterial color="#233745" />
    </mesh>

    <SteeringColumn />
    <group position={[-0.43, 1.16, -0.43]} rotation-x={-0.38} scale={[0.55, 0.55, 0.55]}>
      <group ref={steeringWheel}>
      <mesh>
        <torusGeometry args={[0.305, 0.043, 20, 72]} />
        <meshStandardMaterial color="#111416" metalness={0.08} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.008]}>
        <torusGeometry args={[0.305, 0.032, 16, 72]} />
        <meshStandardMaterial color="#202428" metalness={0.1} roughness={0.38} />
      </mesh>

      <mesh position={[0, 0.303, 0.041]}>
        <boxGeometry args={[0.048, 0.035, 0.024]} />
        <meshStandardMaterial color="#c59a3e" metalness={0.35} roughness={0.28} />
      </mesh>

      <SteeringSpoke angle={Math.PI * 0.61} length={0.165} width={0.105} />
      <SteeringSpoke angle={-Math.PI * 0.61} length={0.165} width={0.105} />
      <SteeringSpoke angle={Math.PI} length={0.178} width={0.11} offset={0.095} />

      <mesh position={[0, -0.005, 0.01]}>
        <cylinderGeometry args={[0.128, 0.145, 0.07, 32]} />
        <meshStandardMaterial color="#1d2226" metalness={0.2} roughness={0.36} />
      </mesh>
      <mesh ref={hornPad} position={[0, -0.003, 0.052]}>
        <cylinderGeometry args={[0.103, 0.112, 0.032, 32]} />
        <meshStandardMaterial color="#2c3237" metalness={0.16} roughness={0.3} emissive="#000000" />
      </mesh>
      <mesh position={[0, -0.003, 0.071]}>
        <circleGeometry args={[0.032, 24]} />
        <meshStandardMaterial color="#4f565c" metalness={0.5} roughness={0.24} />
      </mesh>

      <WheelButtonCluster side="left" />
      <WheelButtonCluster side="right" />

      <mesh position={[-0.285, 0.105, 0.01]} rotation-z={-0.34}>
        <boxGeometry args={[0.018, 0.07, 0.016]} />
        <meshStandardMaterial color="#33383c" roughness={0.32} />
      </mesh>
      <mesh position={[0.285, 0.105, 0.01]} rotation-z={0.34}>
        <boxGeometry args={[0.018, 0.07, 0.016]} />
        <meshStandardMaterial color="#33383c" roughness={0.32} />
      </mesh>
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

    <object3D ref={centerAnchor} position={[0, 1.61, -0.545]} rotation={[0, Math.PI, 0]} />
    <object3D ref={leftAnchor} position={[-1.08, 1.34, -0.415]} rotation={[0, Math.PI - 0.2, 0]} />
    <object3D ref={rightAnchor} position={[1.08, 1.34, -0.415]} rotation={[0, Math.PI + 0.2, 0]} />

    <group position={[0, 1.625, -0.625]} rotation={[MIRROR_SURFACE_POSE.center.pitch, MIRROR_SURFACE_POSE.center.yaw, 0]}>
      <mesh position={[0, 0.145, -0.018]}>
        <boxGeometry args={[0.065, 0.17, 0.05]} />
        <meshStandardMaterial color="#242a2e" roughness={0.42} />
      </mesh>
      <mesh position={[0, 0, -0.012]}>
        <extrudeGeometry args={[centerMirrorShape, { depth: 0.055, bevelEnabled: true, bevelSize: 0.018, bevelThickness: 0.014, bevelSegments: 2 }]} />
        <meshStandardMaterial color="#111518" roughness={0.34} />
      </mesh>
      <mesh ref={centerSurface} position={[0, 0, 0.082]}>
        <shapeGeometry args={[centerMirrorShape]} />
        <meshBasicMaterial map={mirrors.centerTarget.texture} color="#eef7ff" toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>

    <group position={[-1.075, 1.33, -0.48]} rotation={[MIRROR_SURFACE_POSE.left.pitch, MIRROR_SURFACE_POSE.left.yaw, 0]}>
      <mesh position={[0.19, -0.035, -0.015]} rotation-z={-0.14}>
        <boxGeometry args={[0.36, 0.06, 0.085]} />
        <meshStandardMaterial color="#171d22" metalness={0.18} roughness={0.42} />
      </mesh>
      <mesh position={[0, 0, -0.018]}>
        <extrudeGeometry args={[leftMirrorShape, { depth: 0.075, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.018, bevelSegments: 3 }]} />
        <meshStandardMaterial color="#101519" metalness={0.24} roughness={0.32} />
      </mesh>
      <mesh ref={leftSurface} position={[0, 0, 0.104]}>
        <shapeGeometry args={[leftMirrorShape]} />
        <meshBasicMaterial map={mirrors.leftTarget.texture} color="#eef7ff" toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>

    <group position={[1.075, 1.33, -0.48]} rotation={[MIRROR_SURFACE_POSE.right.pitch, MIRROR_SURFACE_POSE.right.yaw, 0]}>
      <mesh position={[-0.19, -0.035, -0.015]} rotation-z={0.14}>
        <boxGeometry args={[0.36, 0.06, 0.085]} />
        <meshStandardMaterial color="#171d22" metalness={0.18} roughness={0.42} />
      </mesh>
      <mesh position={[0, 0, -0.018]}>
        <extrudeGeometry args={[rightMirrorShape, { depth: 0.075, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.018, bevelSegments: 3 }]} />
        <meshStandardMaterial color="#101519" metalness={0.24} roughness={0.32} />
      </mesh>
      <mesh ref={rightSurface} position={[0, 0, 0.104]}>
        <shapeGeometry args={[rightMirrorShape]} />
        <meshBasicMaterial map={mirrors.rightTarget.texture} color="#eef7ff" toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>

    <mesh position={[-0.43, 0.83, 0.48]}>
      <boxGeometry args={[0.52, 0.76, 0.82]} />
      <meshStandardMaterial color="#20262b" roughness={0.82} />
    </mesh>
    <mesh position={[-0.57, 1.08, 0.18]} rotation-z={v.seatbelt ? -0.48 : -0.05}>
      <boxGeometry args={[0.045, 0.62, 0.022]} />
      <meshStandardMaterial color={v.seatbelt ? '#3d4246' : '#24282b'} roughness={0.9} />
    </mesh>

    <object3D ref={headlightTarget} position={[0, 0.45, -40]} />
    <spotLight ref={leftHeadlight} position={[-0.56, 0.68, -2.16]} color="#fff8df" intensity={0} angle={0.28} penumbra={0.55} distance={62} />
    <spotLight ref={rightHeadlight} position={[0.56, 0.68, -2.16]} color="#fff8df" intensity={0} angle={0.28} penumbra={0.55} distance={62} />
    <mesh position={[-0.55, 0.64, 2.17]}><boxGeometry args={[0.42, 0.12, 0.03]} /><meshStandardMaterial color="#7a1616" emissive={v.lowBeam || v.highBeam ? '#6a0d0d' : '#160000'} emissiveIntensity={1.1} /></mesh>
    <mesh position={[0.55, 0.64, 2.17]}><boxGeometry args={[0.42, 0.12, 0.03]} /><meshStandardMaterial color="#7a1616" emissive={v.lowBeam || v.highBeam ? '#6a0d0d' : '#160000'} emissiveIntensity={1.1} /></mesh>
  </group>
}

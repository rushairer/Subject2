import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type MutableRefObject, type ReactElement } from 'react'
import * as THREE from 'three'

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
      centerCamera: new THREE.PerspectiveCamera(44, 512 / 190, 0.08, 260),
      leftCamera: new THREE.PerspectiveCamera(48, 2, 0.08, 220),
      rightCamera: new THREE.PerspectiveCamera(48, 2, 0.08, 220),
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
    if (steeringWheel.current) steeringWheel.current.rotation.z = -v.steeringWheelAngle

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
    surfaces.forEach(surface => { if (surface) surface.visible = false })

    const previousTarget = gl.getRenderTarget()
    for (const rig of rigs) {
      const anchor = rig.anchor.current
      if (!anchor) continue
      anchor.getWorldPosition(rig.camera.position)
      anchor.getWorldQuaternion(rig.camera.quaternion)
      rig.camera.updateMatrixWorld()
      gl.setRenderTarget(rig.target)
      gl.clear()
      gl.render(scene, rig.camera)
    }
    gl.setRenderTarget(previousTarget)
    surfaces.forEach(surface => { if (surface) surface.visible = true })
  }, -1)

  const v = vehicle.current

  return <group ref={root}>
    <mesh position={[0, 0.58, 0]}>
      <boxGeometry args={[1.82, 0.38, 4.4]} />
      <meshStandardMaterial color="#111820" metalness={0.32} roughness={0.48} />
    </mesh>

    <mesh position={[0, 1.02, -0.56]}>
      <boxGeometry args={[1.72, 0.26, 0.36]} />
      <meshStandardMaterial color="#1a2026" roughness={0.52} />
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

    <group ref={steeringWheel} position={[-0.43, 1.08, -0.46]} rotation-x={1.13}>
      <mesh><torusGeometry args={[0.29, 0.036, 14, 42]} /><meshStandardMaterial color="#101214" roughness={0.42} /></mesh>
      <mesh><boxGeometry args={[0.48, 0.032, 0.045]} /><meshStandardMaterial color="#171b1e" /></mesh>
      <mesh><boxGeometry args={[0.035, 0.43, 0.045]} /><meshStandardMaterial color="#171b1e" /></mesh>
      <mesh ref={hornPad}><cylinderGeometry args={[0.09, 0.09, 0.055, 24]} /><meshStandardMaterial color="#252b30" metalness={0.2} emissive="#000000" /></mesh>
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

    <mesh position={[-0.91, 1.25, -0.16]}>
      <boxGeometry args={[0.05, 0.72, 1.65]} />
      <meshStandardMaterial color="#171d22" />
    </mesh>
    <mesh position={[0.91, 1.25, -0.16]}>
      <boxGeometry args={[0.05, 0.72, 1.65]} />
      <meshStandardMaterial color="#171d22" />
    </mesh>
    <mesh position={[0, 1.72, -0.56]}>
      <boxGeometry args={[1.82, 0.08, 0.11]} />
      <meshStandardMaterial color="#161d22" />
    </mesh>

    <object3D ref={centerAnchor} position={[0, 1.69, -0.62]} rotation={[0, Math.PI, 0]} />
    <object3D ref={leftAnchor} position={[-1.01, 1.27, -0.54]} rotation={[0, Math.PI + 0.15, 0]} />
    <object3D ref={rightAnchor} position={[1.01, 1.27, -0.54]} rotation={[0, Math.PI - 0.15, 0]} />

    <group position={[0, 1.66, -0.58]}>
      <mesh><boxGeometry args={[0.68, 0.21, 0.045]} /><meshStandardMaterial color="#111417" roughness={0.4} /></mesh>
      <mesh ref={centerSurface} position={[0, 0, 0.025]}>
        <planeGeometry args={[0.61, 0.15]} />
        <meshBasicMaterial map={mirrors.centerTarget.texture} toneMapped={false} />
      </mesh>
    </group>

    <group position={[-1.0, 1.26, -0.48]} rotation-y={0.22}>
      <mesh><boxGeometry args={[0.42, 0.23, 0.055]} /><meshStandardMaterial color="#101418" /></mesh>
      <mesh ref={leftSurface} position={[0, 0, 0.031]}>
        <planeGeometry args={[0.36, 0.17]} />
        <meshBasicMaterial map={mirrors.leftTarget.texture} toneMapped={false} />
      </mesh>
    </group>

    <group position={[1.0, 1.26, -0.48]} rotation-y={-0.22}>
      <mesh><boxGeometry args={[0.42, 0.23, 0.055]} /><meshStandardMaterial color="#101418" /></mesh>
      <mesh ref={rightSurface} position={[0, 0, 0.031]}>
        <planeGeometry args={[0.36, 0.17]} />
        <meshBasicMaterial map={mirrors.rightTarget.texture} toneMapped={false} />
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

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  frontWindshieldPoint,
  WINDSHIELD_INCLINE,
} from './windshieldGeometry'
import {
  isGlassDropWipedDuringSweep,
  windshieldWiperStrokes,
  wiperGlassPoint,
  wiperSweepPosition,
  type WindshieldWiperMode,
} from './windshieldWipers'

const DROP_COUNT = 112
const UNIT_VERTICAL = new THREE.Vector3(0, 1, 0)

function fraction(value: number): number {
  return value - Math.floor(value)
}

function seeded(index: number, salt: number): number {
  return fraction(Math.sin(index * 78.233 + salt * 419.71) * 46571.923)
}

function setRod(
  mesh: THREE.Mesh | null,
  a: [number, number, number],
  b: [number, number, number],
  start: THREE.Vector3,
  end: THREE.Vector3,
): void {
  if (!mesh) return
  start.set(...a)
  end.set(...b)
  const length = end.distanceTo(start)
  mesh.position.copy(start).add(end).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(UNIT_VERTICAL, end.sub(start).normalize())
  mesh.scale.set(1, length, 1)
}

/**
 * Rain beads live on the real sloped Santana windshield, not on a fullscreen
 * postprocess plane. Wiper rods follow that same glazing and clear only drops
 * in their swept blade tracks. The effect is visual; it cannot touch physics
 * weather, mirrors, steering, collisions or scoring.
 */
export function RainWindshield({
  mode,
}: {
  mode: WindshieldWiperMode
}) {
  const leftArm = useRef<THREE.Mesh>(null)
  const rightArm = useRef<THREE.Mesh>(null)
  const leftBlade = useRef<THREE.Mesh>(null)
  const rightBlade = useRef<THREE.Mesh>(null)
  const rainBeads = useRef<THREE.InstancedMesh>(null)
  const elapsed = useRef(0)
  const wiperElapsed = useRef(0)
  const previousMode = useRef<WindshieldWiperMode>(mode)
  const previousSweep = useRef(0)
  const hiddenUntil = useRef(new Float32Array(DROP_COUNT))
  const diagnosticsEnabled = useMemo(
    () => typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('renderDiagnostics') === '1',
    [],
  )
  const drops = useMemo(() => Array.from({ length: DROP_COUNT }, (_, i) => ({
    x: -0.65 + seeded(i + 1, 1) * 1.3,
    fallingRate: 0.025 + seeded(i + 1, 2) * 0.070,
    initialHeight: seeded(i + 1, 3),
    size: 0.007 + seeded(i + 1, 4) * 0.012,
    stretch: 1.35 + seeded(i + 1, 5),
  })), [])
  const droplet = useMemo(() => new THREE.Object3D(), [])
  const planeRotation = useMemo(
    () => new THREE.Quaternion().setFromEuler(
      new THREE.Euler(WINDSHIELD_INCLINE, 0, 0),
    ), [],
  )
  const scratchA = useMemo(() => new THREE.Vector3(), [])
  const scratchB = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => () => {
    if (diagnosticsEnabled) {
      delete (window as Window & { __subject2RainGlass?: object }).__subject2RainGlass
    }
  }, [diagnosticsEnabled])

  useFrame((_, dt) => {
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.05)) : 0
    elapsed.current += step
    if (previousMode.current !== mode) {
      previousMode.current = mode
      wiperElapsed.current = 0
      previousSweep.current = 0
    } else if (mode !== 'off') {
      wiperElapsed.current += step
    }
    const sweep = wiperSweepPosition(mode, wiperElapsed.current)
    const strokes = windshieldWiperStrokes(sweep)
    for (const [index, stroke] of strokes.entries()) {
      setRod(index === 0 ? leftArm.current : rightArm.current,
        wiperGlassPoint(stroke.pivot),
        wiperGlassPoint(stroke.armEnd),
        scratchA, scratchB)
      setRod(index === 0 ? leftBlade.current : rightBlade.current,
        wiperGlassPoint(stroke.bladeStart, 0.038),
        wiperGlassPoint(stroke.bladeEnd, 0.038),
        scratchA, scratchB)
    }

    const mesh = rainBeads.current
    if (!mesh) return
    let hiddenDrops = 0
    for (let i = 0; i < DROP_COUNT; i += 1) {
      const drop = drops[i]
      const y = 0.09 + fraction(drop.initialHeight -
        elapsed.current * drop.fallingRate) * 0.46
      if (mode !== 'off' && isGlassDropWipedDuringSweep(
        { x: drop.x, y }, previousSweep.current, sweep,
      )) {
        hiddenUntil.current[i] = elapsed.current + 0.55
      }
      droplet.position.set(...frontWindshieldPoint(drop.x, y, 0.045))
      droplet.quaternion.copy(planeRotation)
      const hidden = elapsed.current < hiddenUntil.current[i]
      if (hidden) hiddenDrops += 1
      const size = hidden ? 0 : drop.size
      droplet.scale.set(size, size * drop.stretch, 1)
      droplet.updateMatrix()
      mesh.setMatrixAt(i, droplet.matrix)
    }
    previousSweep.current = sweep
    mesh.instanceMatrix.needsUpdate = true
    if (diagnosticsEnabled) {
      (window as Window & { __subject2RainGlass?: object }).__subject2RainGlass = {
        mode,
        phase: sweep,
        totalDrops: DROP_COUNT,
        visibleDrops: DROP_COUNT - hiddenDrops,
        hiddenDrops,
      }
    }
  })

  return <group name="rain-windshield-and-working-wipers">
    <group name="two-mechanical-windshield-wipers">
      <mesh ref={leftArm}><cylinderGeometry args={[0.008, 0.009, 1, 8]} />
        <meshStandardMaterial color="#252d2d" roughness={0.7} /></mesh>
      <mesh ref={rightArm}><cylinderGeometry args={[0.008, 0.009, 1, 8]} />
        <meshStandardMaterial color="#252d2d" roughness={0.7} /></mesh>
      <mesh ref={leftBlade}><cylinderGeometry args={[0.012, 0.012, 1, 8]} />
        <meshStandardMaterial color="#151e20" roughness={0.92} /></mesh>
      <mesh ref={rightBlade}><cylinderGeometry args={[0.012, 0.012, 1, 8]} />
        <meshStandardMaterial color="#151e20" roughness={0.92} /></mesh>
    </group>
    <instancedMesh ref={rainBeads} args={[undefined, undefined, DROP_COUNT]}
      frustumCulled={false} name="windshield-rain-beads">
      <circleGeometry args={[1, 10]} />
      <meshBasicMaterial color="#c7e4fa" transparent opacity={0.44}
        depthWrite={false} side={THREE.DoubleSide} />
    </instancedMesh>
  </group>
}

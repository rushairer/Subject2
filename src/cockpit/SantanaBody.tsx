import { memo, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { TRAINING_CAR as CAR } from '../sim/vehicleDimensions'

// Visual coachwork only. X = right, -Z = nose. Envelope and axle locations
// remain those of the shared training car, rather than a second physics model.
type Point = [number, number, number]
const PAINT = '#d5ddd9'
const RUBBER = '#25292a'
const HALF = CAR.widthMeters / 2
const END = CAR.lengthMeters / 2

function Panel({ points, color = PAINT, glass = false }: { points: Point[]; color?: string; glass?: boolean }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3))
    const indices = []
    for (let i = 1; i < points.length - 1; i++) indices.push(0, i, i + 1)
    g.setIndex(indices)
    g.computeVertexNormals()
    return g
  }, [points])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} castShadow={!glass} receiveShadow>
    <meshStandardMaterial color={glass ? '#72928e' : color} side={THREE.DoubleSide}
      metalness={glass ? 0.25 : 0.25} roughness={glass ? 0.16 : 0.36}
      transparent={glass} opacity={glass ? 0.23 : 1} depthWrite={!glass} />
  </mesh>
}

function Block({ at, size, color = PAINT }: { at: Point; size: Point; color?: string }) {
  const geometry = useMemo(() => new RoundedBoxGeometry(...size, 2, Math.min(0.035, ...size.map(n => n / 4))), [size])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh position={at} geometry={geometry} castShadow receiveShadow>
    <meshStandardMaterial color={color} roughness={0.4} metalness={0.2} /></mesh>
}

function Strip({ points, color = RUBBER, radius = 0.012 }: { points: Point[]; color?: string; radius?: number }) {
  const geometry = useMemo(() => new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal'), Math.max(2, points.length * 4), radius, 5, false), [points, radius])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry}><meshStandardMaterial color={color} roughness={0.42} metalness={0.3} /></mesh>
}

function SideSkin({ side }: { side: number }) {
  const geometry = useMemo(() => {
    // Trace the bottom edge around each tire: genuine open wheel arches, not
    // dark discs pasted over solid bodywork. Extrusion gives the lip thickness.
    const s = new THREE.Shape()
    s.moveTo(-END + 0.07, 0.39)
    for (const axle of [-CAR.frontAxleFromCenterMeters, CAR.rearAxleFromCenterMeters]) {
      const radius = CAR.wheelRadiusMeters + 0.065
      const start = Math.asin((0.39 - CAR.wheelRadiusMeters) / radius)
      s.lineTo(axle - Math.cos(start) * radius, 0.39)
      for (let i = 0; i <= 24; i++) {
        const a = Math.PI - start - i * (Math.PI - 2 * start) / 24
        s.lineTo(axle + Math.cos(a) * radius, CAR.wheelRadiusMeters + Math.sin(a) * radius)
      }
    }
    s.lineTo(END - 0.07, 0.39)
    s.lineTo(END - 0.07, 0.91)
    s.lineTo(1.23, 1.04)
    s.lineTo(-0.86, 1.04)
    s.lineTo(-END + 0.07, 0.89)
    s.closePath()
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.045, bevelEnabled: false })
    // Shape XY -> vehicle ZY, extruded depth -> vehicle X.
    g.applyMatrix4(new THREE.Matrix4().set(0, 0, side, side * (HALF - 0.045), 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1))
    g.computeVertexNormals()
    return g
  }, [side])
  useEffect(() => () => geometry.dispose(), [geometry])
  const x = side * HALF
  return <group>
    <mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial color={PAINT} side={THREE.DoubleSide} metalness={0.25} roughness={0.36} /></mesh>
    {[-CAR.frontAxleFromCenterMeters, CAR.rearAxleFromCenterMeters].map(axle => <Strip key={axle} radius={0.019} color={PAINT} points={Array.from({ length: 25 }, (_, i) => {
      const start = Math.asin((0.39 - CAR.wheelRadiusMeters) / (CAR.wheelRadiusMeters + 0.068))
      const a = Math.PI - start - i * (Math.PI - 2 * start) / 24
      return [x, CAR.wheelRadiusMeters + Math.sin(a) * (CAR.wheelRadiusMeters + 0.068), axle + Math.cos(a) * (CAR.wheelRadiusMeters + 0.068)]
    })} />)}
    <Block at={[x, 0.66, 0]} size={[0.016, 0.07, 1.98]} color={RUBBER} />
    <Block at={[x, 0.42, 0]} size={[0.018, 0.10, 1.98]} color={RUBBER} />
    {[-0.90, 0.22, 1.02].map(z => <Strip key={z} radius={0.004} points={[[x + side * 0.002, 1.03, z], [x + side * 0.002, 0.76, z], [x + side * 0.002, 0.47, z - 0.035]]} />)}
    {[0.04, 0.85].map(z => <Block key={z} at={[x + side * 0.003, 0.955, z]} size={[0.02, 0.042, 0.15]} color={RUBBER} />)}
    <Block at={[x, 0.845, -1.02]} size={[0.015, 0.045, 0.085]} color="#d48828" />
  </group>
}

function Badge({ z, rear = false }: { z: number; rear?: boolean }) {
  return <group position={[0, rear ? 0.905 : 0.84, z]} rotation-y={rear ? 0 : Math.PI} scale={rear ? 0.76 : 1}>
    <mesh><circleGeometry args={[0.064, 32]} /><meshStandardMaterial color="#17242a" /></mesh>
    <mesh position-z={0.003}><torusGeometry args={[0.06, 0.007, 6, 32]} /><meshStandardMaterial color="#ccd4d6" metalness={0.7} roughness={0.25} /></mesh>
    <Strip radius={0.006} color="#e0e7e6" points={[[-0.03, 0.036, 0.007], [0, -0.008, 0.007], [0.03, 0.036, 0.007]]} />
    <Strip radius={0.005} color="#e0e7e6" points={[[-0.044, 0.003, 0.007], [-0.024, -0.034, 0.007], [0, -0.008, 0.007], [0.024, -0.034, 0.007], [0.044, 0.003, 0.007]]} />
  </group>
}

function Plate({ rear }: { rear: boolean }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512; canvas.height = 128
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#e5b649'; ctx.fillRect(0, 0, 512, 128)
    ctx.strokeStyle = '#292a24'; ctx.lineWidth = 6; ctx.strokeRect(7, 7, 498, 114)
    ctx.fillStyle = '#20251f'; ctx.font = 'bold 65px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('沪 A·2000学', 256, 87)
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace
    return map
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  return <mesh position={[0, 0.54, (rear ? 1 : -1) * (END + 0.001)]} rotation-y={rear ? 0 : Math.PI}>
    <planeGeometry args={[0.43, 0.108]} /><meshStandardMaterial map={texture} roughness={0.5} />
  </mesh>
}

export const SantanaBody = memo(function SantanaBody({ headlights, braking }: { headlights: boolean; braking: boolean }) {
  const roofFront = -0.38, roofRear = 0.83, cowl = -1.0, deck = 1.40
  const low = 1.04, high = 1.64, roofX = 0.72, beltX = HALF - 0.035
  return <group name="santana-2000-coachwork">
    <SideSkin side={-1} /><SideSkin side={1} />
    {/* Hood: crowned center and tapered shoulder facets. */}
    <Panel points={[[-0.76, 0.90, -END + 0.04], [0.76, 0.90, -END + 0.04], [0.80, 1.045, cowl], [-0.80, 1.045, cowl]]} />
    {[-1, 1].map(s => <group key={s}>
      <Panel points={[[s * 0.76, 0.90, -END + 0.04], [s * 0.80, 1.045, cowl], [s * HALF, 1.04, -0.86], [s * HALF, 0.89, -END + 0.07]]} />
      <Strip radius={0.003} color="#63706e" points={[[s * 0.71, 0.906, -END + 0.10], [s * 0.75, 1.05, -1.03]]} />
      <Panel points={[[s * 0.80, 1.045, deck], [s * 0.77, 0.97, END - 0.05], [s * HALF, 0.91, END - 0.07], [s * HALF, 1.04, 1.23]]} />
    </group>)}
    <Panel points={[[-0.80, 1.045, deck], [0.80, 1.045, deck], [0.77, 0.97, END - 0.05], [-0.77, 0.97, END - 0.05]]} />
    <Panel color={RUBBER} points={[[-HALF, 1.04, -1.04], [HALF, 1.04, -1.04], [beltX, low, cowl], [-beltX, low, cowl]]} />
    <Panel points={[[-beltX, low, deck], [beltX, low, deck], [0.80, 1.045, deck + 0.025], [-0.80, 1.045, deck + 0.025]]} />
    {/* Hollow cabin, fitted trapezoidal glazing and separate structural pillars. */}
    <Panel glass points={[[-beltX, low, cowl], [beltX, low, cowl], [roofX, high, roofFront], [-roofX, high, roofFront]]} />
    <Panel glass points={[[-beltX, low, deck], [beltX, low, deck], [roofX, high + 0.025, roofRear], [-roofX, high + 0.025, roofRear]]} />
    <Panel points={[[-roofX, high, roofFront], [roofX, high, roofFront], [roofX, high + 0.025, roofRear], [-roofX, high + 0.025, roofRear]]} />
    {[-1, 1].map(s => {
      const b = s * beltX, t = s * roofX
      return <group key={s}>
        <Panel glass points={[[b, low, cowl], [b, low, deck], [t, high + 0.025, roofRear], [t, high, roofFront]]} />
        <Panel points={[[s * HALF, low, -0.86], [b, low, cowl], [b, low, deck], [s * HALF, low, 1.23]]} />
        <Strip radius={0.016} points={[[b, low, cowl], [t, high, roofFront]]} />
        <Strip radius={0.015} points={[[t, high, roofFront], [t, high + 0.025, roofRear]]} />
        <Strip color={PAINT} radius={0.031} points={[[b, low, cowl], [t, high, roofFront]]} />
        <Strip color={PAINT} radius={0.025} points={[[t, high, roofFront], [t, high + 0.025, roofRear]]} />
        <Panel points={[[b, low, 1.16], [b, low, deck], [t, high + 0.025, roofRear], [t, high, 0.69]]} />
        <Panel color={RUBBER} points={[[b, low, 0.18], [b, low, 0.28], [t, high, 0.28], [t, high, 0.18]]} />
        <Strip radius={0.016} points={[[b, low + 0.01, cowl], [b, low + 0.01, deck]]} />
        <Strip radius={0.009} points={[[b, low + 0.015, 1.03], [t, high - 0.06, 0.73]]} />
      </group>
    })}
    <Strip radius={0.019} points={[[-roofX, high, roofFront], [roofX, high, roofFront]]} />
    <Strip radius={0.022} points={[[-beltX, low, cowl], [beltX, low, cowl]]} />
    <Strip radius={0.018} points={[[-beltX, low, deck], [beltX, low, deck]]} />
    <Strip radius={0.018} points={[[-roofX, high + 0.025, roofRear], [roofX, high + 0.025, roofRear]]} />
    {[-0.4, 0.35].map(x => <Strip key={x} radius={0.01} points={[[x - 0.22, 1.06, -0.97], [x + 0.18, 1.085, -0.94]]} />)}
    {/* Bumpers stay within the same judged length/width as the coachwork. */}
    {[-1, 1].map(s => <group key={s}>
      <Block at={[0, 0.53, s * (END - 0.12)]} size={[CAR.widthMeters - 0.04, 0.28, 0.24]} color={RUBBER} />
      <Block at={[0, 0.66, s * (END - 0.07)]} size={[CAR.widthMeters - 0.08, 0.035, 0.14]} color="#596160" />
      <Block at={[0, 0.815, s * (END - 0.06)]} size={[CAR.widthMeters - 0.14, s > 0 ? 0.31 : 0.24, 0.10]} />
    </group>)}
    <Block at={[0, 0.815, -END + 0.004]} size={[0.70, 0.17, 0.008]} color="#101718" />
    {[0.758, 0.794, 0.83, 0.866].map(y => <Block key={y} at={[0, y, -END]} size={[0.68, 0.009, 0.008]} color="#919b99" />)}
    <Block at={[0, 0.41, -END + 0.002]} size={[0.72, 0.065, 0.008]} color="#111718" />
    {[-1, 1].map(s => <group key={s}>
      <Block at={[s * 0.58, 0.82, -END + 0.003]} size={[0.42, 0.178, 0.015]} color="#353e3d" />
      <mesh position={[s * 0.56, 0.82, -END - 0.002]}><boxGeometry args={[0.34, 0.146, 0.014]} /><meshStandardMaterial color="#d5e0d7" emissive="#fff0c6" emissiveIntensity={headlights ? 1.3 : 0} roughness={0.22} metalness={0.35} /></mesh>
      <Block at={[s * 0.767, 0.82, -END - 0.002]} size={[0.07, 0.146, 0.014]} color="#d7b780" />
      {Array.from({ length: 9 }, (_, i) => <Block key={i} at={[s * 0.56 - 0.15 + i * 0.037, 0.82, -END - 0.01]} size={[0.003, 0.136, 0.002]} color="#a8b5ae" />)}
      <Block at={[s * 0.65, 0.51, -END - 0.002]} size={[0.23, 0.075, 0.012]} color="#d8aa51" />
      <mesh position={[s * 0.585, 0.82, END - 0.002]}><boxGeometry args={[0.43, 0.18, 0.012]} /><meshStandardMaterial color="#8f2222" emissive="#f02116" emissiveIntensity={braking ? 1.5 : headlights ? 0.35 : 0} roughness={0.27} /></mesh>
      <Block at={[s * 0.72, 0.86, END + 0.006]} size={[0.15, 0.065, 0.009]} color="#b76525" />
      <Block at={[s * 0.425, 0.86, END + 0.006]} size={[0.09, 0.065, 0.009]} color="#cbd3cb" />
    </group>)}
    <Badge z={-END - 0.015} /><Badge rear z={END + 0.014} />
    <Plate rear={false} /><Plate rear />
    <Block at={[0, 0.78, -0.91]} size={[1.64, 0.54, 0.09]} color="#333b39" />
    <Block at={[0, 1.015, 1.22]} size={[1.57, 0.06, 0.35]} color="#444c4b" />
  </group>
})

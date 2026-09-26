import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
export type Point3 = [number, number, number]

export function Upholstery({ position, size, color = '#555451', radius = 0.035, rotation = [0, 0, 0] }: {
  position: Point3; size: Point3; color?: string; radius?: number; rotation?: Point3
}) {
  const geometry = useMemo(() => new RoundedBoxGeometry(...size, 3, Math.min(radius, ...size.map(n => n / 2))), [size, radius])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh position={position} rotation={rotation} geometry={geometry} castShadow receiveShadow>
    <meshStandardMaterial color={color} roughness={0.86} /></mesh>
}

export function Rod({ from, to, radius, color = '#323638' }: { from: Point3; to: Point3; radius: number; color?: string }) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
  return <mesh position={a.clone().add(b).multiplyScalar(0.5)} quaternion={q} castShadow>
    <cylinderGeometry args={[radius, radius, a.distanceTo(b), 12]} /><meshStandardMaterial color={color} roughness={0.55} metalness={0.15} /></mesh>
}

/** Flat woven webbing, not a solid diagonal bar. Paths live in the cabin frame. */
export function BeltWebbing({ points }: { points: Point3[] }) {
  const geometry = useMemo(() => {
    const positions: number[] = [], indices: number[] = []
    points.forEach((p, i) => {
      const before = new THREE.Vector3(...points[Math.max(0, i - 1)])
      const after = new THREE.Vector3(...points[Math.min(points.length - 1, i + 1)])
      const width = after.sub(before).normalize().cross(new THREE.Vector3(0, 0, 1)).normalize().multiplyScalar(0.023)
      positions.push(p[0] - width.x, p[1] - width.y, p[2] - width.z, p[0] + width.x, p[1] + width.y, p[2] + width.z)
      if (i) { const n = i * 2; indices.push(n - 2, n - 1, n, n - 1, n + 1, n) }
    })
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals(); return g
  }, [points])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} castShadow><meshStandardMaterial color="#292c2e" roughness={0.98} side={THREE.DoubleSide} /></mesh>
}

import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/** A moving, tightly bounded shadow frustum keeps shadows useful on long routes. */
export function DrivingLighting({ vehicle, night }: { vehicle: MutableRefObject<{ x: number; z: number }>; night: boolean }) {
  const { gl, scene } = useThree()
  const sun = useRef<THREE.DirectionalLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])
  useLayoutEffect(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512
    const ctx = canvas.getContext('2d')!
    const sky = ctx.createLinearGradient(0, 0, 0, 512)
    if (night) { sky.addColorStop(0, '#040b1b'); sky.addColorStop(0.50, '#1b2b43'); sky.addColorStop(1, '#101a18') }
    else { sky.addColorStop(0, '#779fc6'); sky.addColorStop(0.46, '#c7dce6'); sky.addColorStop(0.51, '#d8dfdd'); sky.addColorStop(0.56, '#7e8d76'); sky.addColorStop(1, '#5b6555') }
    ctx.fillStyle = sky; ctx.fillRect(0, 0, 1024, 512)
    const texture = new THREE.CanvasTexture(canvas); texture.mapping = THREE.EquirectangularReflectionMapping; texture.colorSpace = THREE.SRGBColorSpace
    const pmrem = new THREE.PMREMGenerator(gl); const environment = pmrem.fromEquirectangular(texture)
    const previousEnvironment = scene.environment, previousBackground = scene.background
    scene.environment = environment.texture; scene.background = texture
    // Ground and road geometry are still owned by the courses. Only opt their
    // opaque materials into receiving light; no route/collision geometry changes.
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      if (materials.some(m => m instanceof THREE.MeshStandardMaterial && !m.transparent)) object.receiveShadow = true
    })
    return () => { scene.environment = previousEnvironment; scene.background = previousBackground; environment.dispose(); texture.dispose(); pmrem.dispose() }
  }, [gl, scene, night])
  useFrame(() => {
    const x = Math.round(vehicle.current.x * 2) / 2, z = Math.round(vehicle.current.z * 2) / 2
    target.position.set(x, 0, z); target.updateMatrixWorld()
    sun.current?.position.set(x - 8, 17, z - 11)
  })
  return <>
    <primitive object={target} />
    <ambientLight intensity={night ? 0.12 : 0.32} />
    <hemisphereLight args={[night ? '#8eaccf' : '#d7e6f1', '#66614e', night ? 0.18 : 0.75]} />
    <directionalLight ref={sun} target={target} color={night ? '#9bb7db' : '#fff1d7'} intensity={night ? 0.32 : 2.5} castShadow
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-13} shadow-camera-right={13}
      shadow-camera-top={13} shadow-camera-bottom={-13} shadow-camera-near={0.5} shadow-camera-far={60}
      shadow-bias={-0.00015} shadow-normalBias={0.018} />
  </>
}

/** Soft underbody occlusion complements directional shadows at the tire contact. */
export function CarContactShadow() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 256
    const ctx = canvas.getContext('2d')!; ctx.scale(64, 128)
    const gradient = ctx.createRadialGradient(1, 1, 0.2, 1, 1, 1)
    gradient.addColorStop(0, 'rgba(0,0,0,0.42)'); gradient.addColorStop(0.55, 'rgba(0,0,0,0.30)'); gradient.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 2, 2)
    return new THREE.CanvasTexture(canvas)
  }, [])
  useLayoutEffect(() => () => texture.dispose(), [texture])
  return <mesh rotation-x={-Math.PI / 2} position={[0, -0.018, 0]} renderOrder={1}>
    <planeGeometry args={[2.15, 4.7]} /><meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} polygonOffset polygonOffsetFactor={-1} />
  </mesh>
}

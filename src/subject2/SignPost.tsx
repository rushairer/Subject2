import { useEffect, useMemo, type MutableRefObject, type ReactElement } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Vehicle } from '../sim/vehicleCollision'
import type { VehicleAudioState } from '../audio/vehicleAudio'
import type { DrivingIncidentDraft } from '../session/drivingIncident'
import { sceneYawFromHeading } from '../sim/vehicleFrame'
import { useCollisionBody } from '../sim/useCollisionBody'
import {
  localPoseToWorld,
  type CoursePlacement,
} from './courseTransform'

export interface SignPostProps {
  x: number
  z: number
  heading?: number
  vehicle?: MutableRefObject<Vehicle>
  placement?: CoursePlacement
  audioContext?: AudioContext | null
  audioState?: VehicleAudioState
  signText: string
  incident?: DrivingIncidentDraft
  onIncident?: (incident: DrivingIncidentDraft) => void
}

const SIGN_POST_GEOMETRY = {
  poleRadius: 0.07,
  poleTopRadius: 0.05,
  poleHeight: 2.8,
  plateWidth: 1.55,
  plateHeight: 0.8,
  plateThickness: 0.04,
  plateCenterY: 2.55,
} as const

function createSignTexture(signText: string) {
  if (typeof document === 'undefined') return null

  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#176aa7'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = '#f7fbff'
  ctx.lineWidth = 18
  ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48)

  let fontSize = signText.length > 5 ? 116 : 142
  do {
    ctx.font = `700 ${fontSize}px "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`
    if (ctx.measureText(signText).width <= canvas.width - 120) break
    fontSize -= 8
  } while (fontSize > 72)

  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(signText, canvas.width / 2, canvas.height / 2 + 4)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

export function SignPost({
  x,
  z,
  heading = 0,
  vehicle,
  placement,
  audioContext,
  audioState,
  signText,
  incident,
  onIncident,
}: SignPostProps): ReactElement {
  const body = useCollisionBody({
    kind: 'pole',
    player: vehicle,
    audioContext,
    audioState,
    onImpact: incident && onIncident ? () => onIncident(incident) : undefined,
  })
  const signTexture = useMemo(() => createSignTexture(signText), [signText])

  useEffect(() => () => {
    signTexture?.dispose()
  }, [signTexture])

  const localPole = { x, z, heading }
  const worldPole = placement ? localPoseToWorld(localPole, placement) : localPole
  useFrame((_, dt) => {
    body.step(dt)
    body.circle({ x: worldPole.x, z: worldPole.z, radius: SIGN_POST_GEOMETRY.poleRadius })
    body.animate(worldPole.heading)
  }, -1)

  return (
    <group position={[localPole.x, 0, localPole.z]} rotation-y={sceneYawFromHeading(heading)}>
      <group ref={body.visual}>
        {/* Keep the rigid collider at the post base while the visual can wobble after impact. */}
        <mesh position={[0, SIGN_POST_GEOMETRY.poleHeight / 2, -0.09]} castShadow>
          <cylinderGeometry args={[
            SIGN_POST_GEOMETRY.poleTopRadius,
            SIGN_POST_GEOMETRY.poleRadius,
            SIGN_POST_GEOMETRY.poleHeight,
            12,
          ]} />
          <meshStandardMaterial color="#777" metalness={0.7} roughness={0.35} />
        </mesh>

        {/* Compact rear brackets join the centered post to the back of the plate. */}
        {[2.35, 2.75].map(y => (
          <mesh key={y} position={[0, y, -0.055]} castShadow>
            <boxGeometry args={[0.16, 0.055, 0.12]} />
            <meshStandardMaterial color="#555" metalness={0.8} roughness={0.3} />
          </mesh>
        ))}

        <mesh position={[0, SIGN_POST_GEOMETRY.plateCenterY, 0]} castShadow receiveShadow>
          <boxGeometry args={[
            SIGN_POST_GEOMETRY.plateWidth,
            SIGN_POST_GEOMETRY.plateHeight,
            SIGN_POST_GEOMETRY.plateThickness,
          ]} />
          <meshStandardMaterial color="#176aa7" roughness={0.4} />
        </mesh>

        {/* Only the traffic-facing side carries the project name; the rear stays a plain blue backing plate. */}
        {signTexture && (
          <mesh position={[0, SIGN_POST_GEOMETRY.plateCenterY, SIGN_POST_GEOMETRY.plateThickness / 2 + 0.002]}>
            <planeGeometry args={[
              SIGN_POST_GEOMETRY.plateWidth - 0.055,
              SIGN_POST_GEOMETRY.plateHeight - 0.055,
            ]} />
            <meshBasicMaterial map={signTexture} toneMapped={false} />
          </mesh>
        )}
      </group>
    </group>
  )
}

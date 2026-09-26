import { useMemo, type ReactElement } from 'react'
import * as THREE from 'three'
import {
  CENTER_LINE_OFFSET,
  LEFT_EDGE_OFFSET,
  OPPOSITE_DIVIDER,
  RIGHT_EDGE_OFFSET,
  ROAD_CENTER_OFFSET,
  ROAD_WIDTH,
  SAME_DIRECTION_DIVIDER,
  SUBJECT3_ROUTE,
  SUBJECT3_ROUTE_NODE_PAD_SIZE,
  SUBJECT3_SEGMENTS,
  poseAtRouteDistance,
  type Point,
  type RouteSegment,
} from './subject3Route'
import {
  makeArrowTexture,
  makeDiamondTexture,
} from './subject3Signs'
import {
  forwardFromHeading,
  rightFromHeading,
  sceneYawFromHeading,
} from '../sim/vehicleFrame'

/**
 * Standard Chinese Road Pavement Guide Arrow (GB 5768.3 路面导向箭头)
 */
export function PavementArrow({
  type,
  position,
  rotationY = 0,
}: {
  type: 'straight' | 'left' | 'straight-left' | 'straight-right'
  position: [number, number, number]
  rotationY?: number
}): ReactElement {
  const texture = useMemo(() => makeArrowTexture(type), [type])

  return (
    <mesh
      rotation-x={-Math.PI / 2}
      rotation-z={rotationY}
      position={position}
    >
      <planeGeometry args={[1.5, 4.5]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  )
}

/**
 * Standard Chinese Zebra Crossing / Crosswalk (GB 5768.3 人行横道标线与预告标线)
 * - Longitudinal zebra stripes parallel to vehicle travel
 * - Solid stop line before crosswalk
 * - Diamond warning markings (人行横道预告标线 - 菱形) 35m in advance
 */
export function StandardCrosswalk({ distance }: { distance: number }): ReactElement {
  const pose = poseAtRouteDistance(distance)
  const diamondTexture = useMemo(() => makeDiamondTexture(), [])

  // 14 parallel longitudinal stripes spanning across the 14m road width
  // In road-local frame: X is across the road, Z is along the road
  // Each stripe is 0.45m wide (X) and 4.0m long (Z), parallel to vehicle travel
  const stripeXOffsets = useMemo(() => [
    -11.6, -10.6, -9.6, -8.6, -7.6, -6.6, -5.6,
    -4.6, -3.6, -2.6, -1.6, -0.6, 0.4, 1.4,
  ], [])

  return (
    <group
      position={[
        pose.x + pose.rightX * ROAD_CENTER_OFFSET,
        0.009,
        pose.z + pose.rightZ * ROAD_CENTER_OFFSET,
      ]}
      rotation-y={sceneYawFromHeading(pose.heading)}
    >
      {/* Longitudinal white zebra stripes parallel to traffic flow */}
      {stripeXOffsets.map((x, index) => (
        <mesh
          key={`stripe-${index}`}
          rotation-x={-Math.PI / 2}
          position={[x - ROAD_CENTER_OFFSET, 0.002, 0]}
          receiveShadow
        >
          <planeGeometry args={[0.45, 4.0]} />
          <meshBasicMaterial color="#f8f8f8" />
        </mesh>
      ))}

      {/* Solid Stop Line for forward traffic: 2.8m before crosswalk (at z = +4.8 in local frame) */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[-1.75 - ROAD_CENTER_OFFSET, 0.003, 4.8]}
        receiveShadow
      >
        <planeGeometry args={[7.0, 0.40]} />
        <meshBasicMaterial color="#f8f8f8" />
      </mesh>

      {/* Solid Stop Line for oncoming traffic: 2.8m before crosswalk (at z = -4.8 in local frame) */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[-8.75 - ROAD_CENTER_OFFSET, 0.003, -4.8]}
        receiveShadow
      >
        <planeGeometry args={[7.0, 0.40]} />
        <meshBasicMaterial color="#f8f8f8" />
      </mesh>

      {/* Diamond Warning Markings (人行横道预告标线 - 菱形) 35m before crosswalk */}
      {/* Forward traffic lanes: lane 1 (x = 0) and lane 2 (x = -3.5) */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0 - ROAD_CENTER_OFFSET, 0.004, 35]}
      >
        <planeGeometry args={[1.2, 5.0]} />
        <meshBasicMaterial map={diamondTexture} transparent toneMapped={false} />
      </mesh>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[-3.5 - ROAD_CENTER_OFFSET, 0.004, 35]}
      >
        <planeGeometry args={[1.2, 5.0]} />
        <meshBasicMaterial map={diamondTexture} transparent toneMapped={false} />
      </mesh>

      {/* Oncoming traffic lanes: lane 3 (x = -7.0) and lane 4 (x = -10.5) */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[-7.0 - ROAD_CENTER_OFFSET, 0.004, -35]}
      >
        <planeGeometry args={[1.2, 5.0]} />
        <meshBasicMaterial map={diamondTexture} transparent toneMapped={false} />
      </mesh>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[-10.5 - ROAD_CENTER_OFFSET, 0.004, -35]}
      >
        <planeGeometry args={[1.2, 5.0]} />
        <meshBasicMaterial map={diamondTexture} transparent toneMapped={false} />
      </mesh>
    </group>
  )
}

/**
 * Standard Chinese Road Segment Markings (GB 5768.3 道路标线)
 * - Double solid yellow center lines (双黄实线)
 * - White outer road edge lines (车道边缘线)
 * - Dashed lane dividers transitioning to solid lines approaching intersections
 * - Stop lines at intersection entrances
 * - Pavement guide arrows before intersections
 */
export function StandardRoadSegment({
  segment,
  index,
}: {
  segment: RouteSegment
  index: number
}): ReactElement {
  const isFirstSegment = index === 0
  const isLastSegment = index === SUBJECT3_SEGMENTS.length - 1

  // Determine what turn happens at the end of this segment
  let nextTurnType: 'left' | 'right' | 'straight' = 'straight'
  if (!isLastSegment) {
    const nextSeg = SUBJECT3_SEGMENTS[index + 1]
    const dHeading = Math.atan2(
      Math.sin(nextSeg.heading - segment.heading),
      Math.cos(nextSeg.heading - segment.heading),
    )
    if (dHeading < -0.3) nextTurnType = 'left'
    else if (dHeading > 0.3) nextTurnType = 'right'
  }

  // Segment ends:
  // Point A is at local z = +segment.length / 2
  // Point B is at local z = -segment.length / 2
  // Vehicles travel from +Z towards -Z!
  const junctionMargin = 10.0
  const zEntrance = isFirstSegment ? segment.length / 2 : segment.length / 2 - junctionMargin
  const zExit = isLastSegment ? -segment.length / 2 : -segment.length / 2 + junctionMargin

  const markingLength = zEntrance - zExit
  const markingCenterZ = (zEntrance + zExit) / 2

  // Dashed lines with 5m line and 8m gap
  const solidApproachLength = 32.0 // 32m of solid divider before stop line
  const dashedZStart = zExit + solidApproachLength
  const dashedLength = Math.max(0, zEntrance - dashedZStart)
  const dashCount = Math.floor(dashedLength / 13)

  const leftArrowType = nextTurnType === 'left' ? 'left' : 'straight-left'
  const rightArrowType = nextTurnType === 'right' ? 'straight-right' : 'straight'

  return (
    <group
      position={[(segment.a.x + segment.b.x) / 2, 0, (segment.a.z + segment.b.z) / 2]}
      rotation-y={sceneYawFromHeading(segment.heading)}
    >
      {/* Asphalt road base */}
      <mesh rotation-x={-Math.PI / 2} position={[ROAD_CENTER_OFFSET, -0.02, 0]} receiveShadow>
        <planeGeometry args={[ROAD_WIDTH, segment.length + 0.5]} />
        <meshStandardMaterial color="#393e43" roughness={0.96} />
      </mesh>

      {/* 1. White Solid Road Outer Edge Lines */}
      {/* Right road edge line (x = 1.75) */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[RIGHT_EDGE_OFFSET, 0.005, markingCenterZ]}
        receiveShadow
      >
        <planeGeometry args={[0.15, markingLength]} />
        <meshBasicMaterial color="#f1f1ea" />
      </mesh>
      {/* Left road edge line (x = -12.25) */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[LEFT_EDGE_OFFSET, 0.005, markingCenterZ]}
        receiveShadow
      >
        <planeGeometry args={[0.15, markingLength]} />
        <meshBasicMaterial color="#f1f1ea" />
      </mesh>

      {/* 2. Double Solid Yellow Center Lines (双黄实线) */}
      {/* Left yellow line */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[CENTER_LINE_OFFSET - 0.15, 0.006, markingCenterZ]}
        receiveShadow
      >
        <planeGeometry args={[0.15, markingLength]} />
        <meshBasicMaterial color="#f59e0b" />
      </mesh>
      {/* Right yellow line */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[CENTER_LINE_OFFSET + 0.15, 0.006, markingCenterZ]}
        receiveShadow
      >
        <planeGeometry args={[0.15, markingLength]} />
        <meshBasicMaterial color="#f59e0b" />
      </mesh>

      {/* 3. Same-Direction Lane Divider (Forward lanes 1 & 2 at x = -1.75) */}
      {/* Solid white line approaching intersection (禁止变道实线) */}
      {!isLastSegment && (
        <mesh
          rotation-x={-Math.PI / 2}
          position={[SAME_DIRECTION_DIVIDER, 0.007, zExit + solidApproachLength / 2]}
          receiveShadow
        >
          <planeGeometry args={[0.14, solidApproachLength]} />
          <meshBasicMaterial color="#ecece6" />
        </mesh>
      )}
      {/* Dashed white divider on straight portions */}
      {Array.from({ length: dashCount }, (_, i) => {
        const z = dashedZStart + 3 + i * 13
        return (
          <mesh
            key={`same-dash-${i}`}
            rotation-x={-Math.PI / 2}
            position={[SAME_DIRECTION_DIVIDER, 0.007, z]}
          >
            <planeGeometry args={[0.12, 5.0]} />
            <meshBasicMaterial color="#ecece6" />
          </mesh>
        )
      })}

      {/* 4. Opposite Direction Lane Divider (Oncoming lanes 3 & 4 at x = -8.75) */}
      {Array.from({ length: Math.floor(markingLength / 13) }, (_, i) => {
        const z = zExit + 4 + i * 13
        return (
          <mesh
            key={`opp-dash-${i}`}
            rotation-x={-Math.PI / 2}
            position={[OPPOSITE_DIVIDER, 0.007, z]}
          >
            <planeGeometry args={[0.12, 5.0]} />
            <meshBasicMaterial color="#ecece6" />
          </mesh>
        )
      })}

      {/* 5. Solid White Stop Line at Intersection Entrance (停止线) */}
      {!isLastSegment && (
        <mesh
          rotation-x={-Math.PI / 2}
          position={[-1.75, 0.008, zExit]}
          receiveShadow
        >
          <planeGeometry args={[7.0, 0.40]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      )}

      {/* 6. Pavement Guide Arrows before Intersection (路面导向箭头) */}
      {!isLastSegment && (
        <>
          {/* 14m before stop line */}
          <PavementArrow
            type={leftArrowType}
            position={[-3.5, 0.008, zExit + 14]}
          />
          <PavementArrow
            type={rightArrowType}
            position={[0, 0.008, zExit + 14]}
          />
          {/* 28m before stop line */}
          <PavementArrow
            type={leftArrowType}
            position={[-3.5, 0.008, zExit + 28]}
          />
          <PavementArrow
            type={rightArrowType}
            position={[0, 0.008, zExit + 28]}
          />
        </>
      )}
    </group>
  )
}

/**
 * Standard Chinese Intersection Corner Guide Lines (GB 5768.3 路口转弯导向虚线)
 * In the 20m x 20m corner junction area:
 * - Generates smooth circular arc dashed guide lines guiding vehicles through the turn
 * - Connects the incoming lane dividers to the outgoing lane dividers smoothly
 */
export function CornerJunctionMarkings({
  nodeIndex,
}: {
  nodeIndex: number
}): ReactElement | null {
  if (nodeIndex === 0 || nodeIndex >= SUBJECT3_ROUTE.length - 1) return null

  const nodePoint = SUBJECT3_ROUTE[nodeIndex]
  const segIn = SUBJECT3_SEGMENTS[nodeIndex - 1]
  const segOut = SUBJECT3_SEGMENTS[nodeIndex]

  // Calculate turning direction and angle
  const dHeading = Math.atan2(
    Math.sin(segOut.heading - segIn.heading),
    Math.cos(segOut.heading - segIn.heading),
  )
  const isTurn = Math.abs(dHeading) > 0.3

  // For 90-degree turning intersections:
  // Generate 5-segment dashed turning guide lines
  const dashes = useMemo(() => {
    if (!isTurn) return []

    const items: Array<{ x: number; z: number; heading: number }> = []
    const R = 10.0 // Intersection transition radius
    const forwardIn = forwardFromHeading(segIn.heading)
    const forwardOut = forwardFromHeading(segOut.heading)
    const rightIn = rightFromHeading(segIn.heading)
    const rightOut = rightFromHeading(segOut.heading)

    // Guide line connecting same-direction lane divider (-1.75) through the turn
    const lateral = SAME_DIRECTION_DIVIDER
    const p0 = {
      x: nodePoint.x - forwardIn.x * R + rightIn.x * lateral,
      z: nodePoint.z - forwardIn.z * R + rightIn.z * lateral,
    }
    const p3 = {
      x: nodePoint.x + forwardOut.x * R + rightOut.x * lateral,
      z: nodePoint.z + forwardOut.z * R + rightOut.z * lateral,
    }
    const handle = R * 0.55
    const p1 = {
      x: p0.x + forwardIn.x * handle,
      z: p0.z + forwardIn.z * handle,
    }
    const p2 = {
      x: p3.x - forwardOut.x * handle,
      z: p3.z - forwardOut.z * handle,
    }

    const count = 5
    for (let i = 1; i <= count; i++) {
      const u = (i - 0.5) / count
      const invU = 1 - u
      const x =
        invU * invU * invU * p0.x +
        3 * invU * invU * u * p1.x +
        3 * invU * u * u * p2.x +
        u * u * u * p3.x
      const z =
        invU * invU * invU * p0.z +
        3 * invU * invU * u * p1.z +
        3 * invU * u * u * p2.z +
        u * u * u * p3.z

      // Tangent direction
      const dx =
        3 * invU * invU * (p1.x - p0.x) +
        6 * invU * u * (p2.x - p1.x) +
        3 * u * u * (p3.x - p2.x)
      const dz =
        3 * invU * invU * (p1.z - p0.z) +
        6 * invU * u * (p2.z - p1.z) +
        3 * u * u * (p3.z - p2.z)
      const heading = Math.atan2(dx, -dz)

      items.push({ x, z, heading })
    }

    return items
  }, [isTurn, nodePoint, segIn, segOut])

  return (
    <group>
      {/* Intersection asphalt pad */}
      <mesh
        key={`pad-${nodeIndex}`}
        rotation-x={-Math.PI / 2}
        position={[nodePoint.x, -0.015, nodePoint.z]}
        receiveShadow
      >
        <planeGeometry args={[SUBJECT3_ROUTE_NODE_PAD_SIZE, SUBJECT3_ROUTE_NODE_PAD_SIZE]} />
        <meshStandardMaterial color="#393e43" roughness={0.96} />
      </mesh>

      {/* Dashed turning guide lines across the intersection */}
      {dashes.map((d, idx) => (
        <mesh
          key={`turn-dash-${idx}`}
          rotation-x={-Math.PI / 2}
          rotation-z={sceneYawFromHeading(d.heading)}
          position={[d.x, 0.006, d.z]}
        >
          <planeGeometry args={[0.15, 1.3]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}
    </group>
  )
}

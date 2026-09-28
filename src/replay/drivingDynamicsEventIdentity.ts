export type DrivingDynamicsEventKind =
  | 'sudden-brake'
  | 'cut-in'
  | 'pedestrian'

export function drivingDynamicsEventId(
  kind: DrivingDynamicsEventKind,
  actorId: string,
  triggerTime: number,
) {
  return `${kind}:${actorId}:${triggerTime.toFixed(3)}`
}

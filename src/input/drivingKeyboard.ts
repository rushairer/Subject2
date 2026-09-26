export type DrivingKey =
  | 'w' | 's' | 'a' | 'd' | 'arrowup' | 'arrowdown' | 'arrowleft' | 'arrowright'
  | 'c' | 'shift' | 'space' | 'i' | 'q' | 'e' | 'v' | 'l' | 'k'
  | 'n' | 'r' | 'g' | '1' | '2' | '3' | '4' | '5' | 'b' | 't'
  | 'z' | 'x' | 'f' | 'm'

export type DrivingKeys = Partial<Record<DrivingKey, boolean>>

const recognizedKeys = new Set<string>([
  'w', 's', 'a', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
  'c', 'shift', 'space', 'i', 'q', 'e', 'v', 'l', 'k', 'n', 'r', 'g',
  '1', '2', '3', '4', '5', 'b', 't', 'z', 'x', 'f', 'm',
])

/** Physical key codes keep Shift+digit and key-up after modifier changes consistent. */
export function drivingKey(event: { code?: string; key: string }): DrivingKey | null {
  const code = event.code ?? ''
  const physical = /^(Key[A-Z]|Digit[1-5])$/.test(code)
    ? code.replace(/^(Key|Digit)/, '').toLowerCase()
    : code === 'ShiftLeft' || code === 'ShiftRight'
      ? 'shift'
      : code.toLowerCase()
  const fallback = event.key === ' ' || event.key === 'Spacebar' ? 'space' : event.key.toLowerCase()
  const key = recognizedKeys.has(physical) ? physical : fallback
  return recognizedKeys.has(key) ? key as DrivingKey : null
}

/** Held controls still update on repeats; toggle actions only run on the first keydown. */
export function pressDrivingKey(keys: DrivingKeys, key: DrivingKey, repeat = false): boolean {
  const firstPress = !keys[key] && !repeat
  keys[key] = true
  return firstPress
}

export function releaseDrivingKey(keys: DrivingKeys, key: DrivingKey) {
  delete keys[key]
}

export function clearDrivingKeys(keys: DrivingKeys) {
  for (const key of Object.keys(keys) as DrivingKey[]) delete keys[key]
}

export function drivingLook(keys: DrivingKeys) {
  return {
    lookLeft: !!keys.z,
    lookRight: !!keys.x,
    lookBack: !!keys.f,
    yaw: keys.f ? Math.PI : keys.z ? 0.62 : keys.x ? -0.62 : 0,
  }
}

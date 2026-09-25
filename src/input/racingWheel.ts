export interface CenteredAxisCalibration {
  index: number
  left: number
  center: number
  right: number
}

export interface PedalAxisCalibration {
  index: number
  rest: number
  pressed: number
}

export interface RacingWheelMapping {
  deviceId: string
  steering: CenteredAxisCalibration
  throttle: PedalAxisCalibration
  brake: PedalAxisCalibration
  clutch?: PedalAxisCalibration
  calibratedAt: number
}

export interface RacingWheelControls {
  connected: boolean
  deviceId?: string
  steering: number
  throttle: number
  brake: number
  clutch?: number
}

const STORAGE_KEY = 'subject2.racingWheelMappings.v1'

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function getConnectedGamepads(): Gamepad[] {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return []
  return Array.from(navigator.getGamepads()).filter((item): item is Gamepad => Boolean(item?.connected))
}

export function findPreferredRacingWheel(): Gamepad | null {
  const devices = getConnectedGamepads()
  if (devices.length === 0) return null
  const preferred = devices.find(device => /t598|thrustmaster|racing\s*wheel|wheel/i.test(device.id))
  return preferred ?? devices[0] ?? null
}

function loadAllMappings(): Record<string, RacingWheelMapping> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, RacingWheelMapping>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function loadRacingWheelMapping(deviceId: string): RacingWheelMapping | null {
  return loadAllMappings()[deviceId] ?? null
}

export function saveRacingWheelMapping(mapping: RacingWheelMapping) {
  if (typeof window === 'undefined') return
  try {
    const all = loadAllMappings()
    all[mapping.deviceId] = mapping
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // Wheel calibration is optional; simulator remains usable with keyboard controls.
  }
}

export function removeRacingWheelMapping(deviceId: string) {
  if (typeof window === 'undefined') return
  try {
    const all = loadAllMappings()
    delete all[deviceId]
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // Ignore storage failures.
  }
}

export function snapshotAxes(gamepad: Gamepad): number[] {
  return Array.from(gamepad.axes)
}

export function detectMovedAxis(
  baseline: number[],
  current: number[],
  excluded: number[] = [],
): number | null {
  let bestIndex = -1
  let bestDelta = 0.12
  for (let index = 0; index < Math.max(baseline.length, current.length); index++) {
    if (excluded.includes(index)) continue
    const delta = Math.abs((current[index] ?? 0) - (baseline[index] ?? 0))
    if (delta > bestDelta) {
      bestDelta = delta
      bestIndex = index
    }
  }
  return bestIndex >= 0 ? bestIndex : null
}

function normalizeSteering(raw: number, calibration: CenteredAxisCalibration) {
  const { left, center, right } = calibration
  if (raw <= center) {
    const denominator = center - left
    if (Math.abs(denominator) < 0.001) return 0
    return clamp(-((center - raw) / denominator), -1, 0)
  }
  const denominator = right - center
  if (Math.abs(denominator) < 0.001) return 0
  return clamp((raw - center) / denominator, 0, 1)
}

function normalizePedal(raw: number, calibration: PedalAxisCalibration) {
  const denominator = calibration.pressed - calibration.rest
  if (Math.abs(denominator) < 0.001) return 0
  return clamp((raw - calibration.rest) / denominator, 0, 1)
}

export function readRacingWheelControls(): RacingWheelControls {
  const gamepad = findPreferredRacingWheel()
  if (!gamepad) return { connected: false, steering: 0, throttle: 0, brake: 0 }

  const mapping = loadRacingWheelMapping(gamepad.id)
  if (!mapping) {
    return { connected: true, deviceId: gamepad.id, steering: 0, throttle: 0, brake: 0 }
  }

  return {
    connected: true,
    deviceId: gamepad.id,
    steering: normalizeSteering(gamepad.axes[mapping.steering.index] ?? 0, mapping.steering),
    throttle: normalizePedal(gamepad.axes[mapping.throttle.index] ?? mapping.throttle.rest, mapping.throttle),
    brake: normalizePedal(gamepad.axes[mapping.brake.index] ?? mapping.brake.rest, mapping.brake),
    clutch: mapping.clutch
      ? normalizePedal(gamepad.axes[mapping.clutch.index] ?? mapping.clutch.rest, mapping.clutch)
      : undefined,
  }
}

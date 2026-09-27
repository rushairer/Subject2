import { DRIVING_RULES } from '../rules/drivingRules'

export interface TurnSignalAutoCancelState {
  leftArmed: boolean
  rightArmed: boolean
}

export interface TurnSignalAutoCancelInput {
  steeringWheelAngle: number
  leftIndicator: boolean
  rightIndicator: boolean
  hazard: boolean
}

export interface TurnSignalAutoCancelOutput {
  leftIndicator: boolean
  rightIndicator: boolean
}

export function createTurnSignalAutoCancelState(): TurnSignalAutoCancelState {
  return {
    leftArmed: false,
    rightArmed: false,
  }
}

export function resetTurnSignalAutoCancel(state: TurnSignalAutoCancelState) {
  state.leftArmed = false
  state.rightArmed = false
}

export function stepTurnSignalAutoCancel(
  state: TurnSignalAutoCancelState,
  input: TurnSignalAutoCancelInput,
): TurnSignalAutoCancelOutput {
  if (input.hazard) {
    resetTurnSignalAutoCancel(state)
    return {
      leftIndicator: input.leftIndicator,
      rightIndicator: input.rightIndicator,
    }
  }

  if (!input.leftIndicator) state.leftArmed = false
  if (!input.rightIndicator) state.rightArmed = false

  const {
    autoCancelArmWheelAngleRadians,
    autoCancelReturnWheelAngleRadians,
  } = DRIVING_RULES.turnSignal

  if (
    input.leftIndicator &&
    input.steeringWheelAngle <= -autoCancelArmWheelAngleRadians
  ) {
    state.leftArmed = true
  }
  if (
    input.rightIndicator &&
    input.steeringWheelAngle >= autoCancelArmWheelAngleRadians
  ) {
    state.rightArmed = true
  }

  const cancelLeft =
    input.leftIndicator &&
    state.leftArmed &&
    input.steeringWheelAngle >= -autoCancelReturnWheelAngleRadians
  const cancelRight =
    input.rightIndicator &&
    state.rightArmed &&
    input.steeringWheelAngle <= autoCancelReturnWheelAngleRadians

  if (cancelLeft) state.leftArmed = false
  if (cancelRight) state.rightArmed = false

  return {
    leftIndicator: cancelLeft ? false : input.leftIndicator,
    rightIndicator: cancelRight ? false : input.rightIndicator,
  }
}

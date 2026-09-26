export type NightLightAnswer = 'low' | 'flash'

export interface NightLightVehicleState {
  lowBeam: boolean
  highBeam: boolean
}

export interface NightLightAttempt {
  actionCount: number
  sawHighBeam: boolean
  sawLowBeamAfterHigh: boolean
}

export function createNightLightAttempt(): NightLightAttempt {
  return {
    actionCount: 0,
    sawHighBeam: false,
    sawLowBeamAfterHigh: false,
  }
}

export function recordNightLightAction(attempt: NightLightAttempt) {
  attempt.actionCount += 1
}

export function observeNightLightState(
  attempt: NightLightAttempt,
  vehicle: NightLightVehicleState,
) {
  if (vehicle.highBeam) attempt.sawHighBeam = true
  if (
    attempt.sawHighBeam &&
    vehicle.lowBeam &&
    !vehicle.highBeam
  ) {
    attempt.sawLowBeamAfterHigh = true
  }
}

export function nightLightAnswerSatisfied(
  answer: NightLightAnswer,
  attempt: NightLightAttempt,
  vehicle: NightLightVehicleState,
) {
  if (answer === 'low') {
    return (
      attempt.actionCount > 0 &&
      vehicle.lowBeam &&
      !vehicle.highBeam
    )
  }

  return (
    attempt.actionCount >= 2 &&
    attempt.sawHighBeam &&
    attempt.sawLowBeamAfterHigh &&
    vehicle.lowBeam &&
    !vehicle.highBeam
  )
}

import {
  recordNightLightAction,
  type NightLightAnswer,
  type NightLightAttempt,
  type NightLightVehicleState,
} from '../subject3/nightLightExam'

export interface Subject3LightCoachAction {
  afterMs: number
  lowBeam: boolean
  highBeam: boolean
  label: string
}

export function subject3LightCoachSequence(
  answer: NightLightAnswer,
): Subject3LightCoachAction[] {
  if (answer === 'low') {
    return [{
      afterMs: 550,
      lowBeam: true,
      highBeam: false,
      label: '切换近光灯',
    }]
  }

  return [
    {
      afterMs: 500,
      lowBeam: false,
      highBeam: true,
      label: '先切远光灯',
    },
    {
      afterMs: 900,
      lowBeam: true,
      highBeam: false,
      label: '再切回近光灯，完成远近光交替',
    },
  ]
}

export function applySubject3LightCoachAction(
  vehicle: NightLightVehicleState,
  attempt: NightLightAttempt,
  action: Subject3LightCoachAction,
) {
  vehicle.lowBeam = action.lowBeam
  vehicle.highBeam = action.highBeam
  recordNightLightAction(attempt)
}

import {
  recordNightLightAction,
  type NightLightAnswer,
  type NightLightAttempt,
  type NightLightVehicleState,
} from '../subject3/nightLightExam'

export type Subject3LightCoachControl = 'low-toggle' | 'high-toggle'

export interface Subject3LightCoachAction {
  afterMs: number
  control: Subject3LightCoachControl
  label: string
}

function toggleLightState(
  state: NightLightVehicleState,
  control: Subject3LightCoachControl,
) {
  if (control === 'low-toggle') {
    state.lowBeam = !state.lowBeam
    state.highBeam = false
    return
  }

  state.highBeam = !state.highBeam
  if (state.highBeam) state.lowBeam = true
}

export function subject3LightCoachSequence(
  answer: NightLightAnswer,
  initialState: NightLightVehicleState,
): Subject3LightCoachAction[] {
  const state = { ...initialState }
  const actions: Omit<Subject3LightCoachAction, 'afterMs'>[] = []

  const push = (
    control: Subject3LightCoachControl,
    label: string,
  ) => {
    actions.push({ control, label })
    toggleLightState(state, control)
  }

  if (answer === 'low') {
    if (state.highBeam) {
      push('high-toggle', '关闭远光，回到近光')
    }
    if (!state.lowBeam) {
      push('low-toggle', '切换近光灯')
    }
    if (actions.length === 0) {
      push('low-toggle', '重新操作近光灯开关')
      push('low-toggle', '再次开启近光灯')
    }
  } else {
    if (state.highBeam) {
      push('high-toggle', '先关闭已有远光状态')
    }
    push('high-toggle', '切换远光灯')
    push('high-toggle', '切回近光灯，完成远近光交替')
  }

  return actions.map((action, index) => ({
    ...action,
    afterMs: 500 + index * 350,
  }))
}

export function applySubject3LightCoachAction(
  vehicle: NightLightVehicleState,
  attempt: NightLightAttempt,
  action: Subject3LightCoachAction,
) {
  toggleLightState(vehicle, action.control)
  recordNightLightAction(attempt)
}

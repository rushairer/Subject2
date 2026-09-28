export interface CoachTeachingVehicle {
  speed: number
  gear: number
  steeringWheelAngle: number
  throttle: number
  brake: number
  clutch: number
  handbrake: boolean
  leftIndicator: boolean
  rightIndicator: boolean
  lowBeam: boolean
  highBeam: boolean
}

export interface CoachTeachingInput {
  examId: string
  status: string
  automatic: boolean
  vehicle: CoachTeachingVehicle
}

export interface CoachTeachingHint {
  action: string
  reason: string
  watch: string
  operation: string
}

function normalizedAction(status: string) {
  return status
    .replace(/^教练驾驶中\s*·\s*/, '')
    .replace(/^科目三示范\s*·\s*/, '')
    .replace(/^教练驾驶\s*·\s*/, '')
    .trim()
}

function subject2Teaching(action: string): Pick<CoachTeachingHint, 'reason' | 'watch'> {
  if (/连接道路/.test(action)) {
    return {
      reason: '先把车身稳定带到下一项目入口，再进入项目判定区，避免带着横向偏差开始动作。',
      watch: '看车道中心、下一项目入口和车身朝向，进入前把方向逐步回正。',
    }
  }
  if (/倒车入库/.test(action) || /第一次倒库|第二次倒库/.test(action)) {
    return {
      reason: '倒库的关键是用低速和固定转向几何控制后轮轨迹，给车身回正留足空间。',
      watch: '重点看库角、后轮与边线余量，以及车身是否逐渐与库线平行。',
    }
  }
  if (/出库|驶向另一端|返回起始端/.test(action)) {
    return {
      reason: '出库时先确保车身和库口有足够余量，再转向，避免前角或后轮压线。',
      watch: '同时看外侧前角和内侧后轮，确认越过关键位置后再逐步加大转向。',
    }
  }
  if (/侧方/.test(action)) {
    return {
      reason: '侧方停车通过连续倒车转向把车辆从车道横移进库，转向时机决定后轮是否压线。',
      watch: '看右后轮与库口、车尾进入深度和车身平行度，出库前先确认左侧空间。',
    }
  }
  if (/曲线/.test(action)) {
    return {
      reason: 'S 弯要保持低速连续修正，让前后轮轨迹都留在道路边界内。',
      watch: '看车头与外侧边线的间距，并预判内侧后轮轨迹，不要等贴线后才急修方向。',
    }
  }
  if (/直角/.test(action)) {
    return {
      reason: '直角转弯需要先建立靠右余量，再在固定转向位置转入横向车道。',
      watch: '看右侧车身距离、内侧后轮和外侧车头，确认车尾过角后及时回正。',
    }
  }
  if (/坡道/.test(action)) {
    return {
      reason: '坡道项目同时要求纵向定点、右侧距离和防后溜，必须低速精确收车并用驻车制动稳住。',
      watch: '看前保险杠与停车线、右侧 30cm 余量，以及松手刹起步时车辆是否后溜。',
    }
  }
  return {
    reason: '教练正在按标准轨迹闭环修正方向和速度，车辆仍经过真实物理与原考试判定。',
    watch: '观察车身相对边线的位置、方向盘回正时机和速度变化。',
  }
}

function subject3Teaching(action: string): Pick<CoachTeachingHint, 'reason' | 'watch'> {
  if (/灯光预检/.test(action)) {
    return {
      reason: '模拟灯光考试按语音口令逐题操作：会车和近距离跟车保持近光，通过无信号路口或人行横道要完成远光再切回近光的完整交替。',
      watch: '先听完整口令再操作；近光题确认远光关闭，交替题确认出现过远光且最终回到近光。',
    }
  }
  if (/急刹/.test(action)) {
    return {
      reason: '前车速度骤降时先释放动力并建立制动，优先恢复安全纵向间距，而不是临时急打方向。',
      watch: '看前车减速度、车距和本车制动后的剩余空间，确认冲突解除再恢复速度。',
    }
  }
  if (/加塞/.test(action)) {
    return {
      reason: '电动车进入本车冲突区时先减速让出纵向空间，避免用横向闪避制造新的碰撞风险。',
      watch: '看加塞目标的横向移动、前后距离和本车制动余量。',
    }
  }
  if (/行人|人行横道/.test(action)) {
    return {
      reason: '行人进入冲突区域时以停车让行为优先，等通行冲突解除后再继续。',
      watch: '持续看行人是否完全离开本车行驶路径，并确认两侧没有新的横穿目标。',
    }
  }
  if (/起步/.test(action)) {
    return {
      reason: '起步前先完成安全带、左转向灯和后方观察，并保留足够信号提前量。',
      watch: '看左后方交通和左侧空间，确认安全后再平稳释放驻车制动并起步。',
    }
  }
  if (/直线/.test(action)) {
    return {
      reason: '直线行驶以稳定车道位置和速度为主，方向只做小幅连续修正。',
      watch: '看远处车道中心，同时周期性观察后方交通和前车距离。',
    }
  }
  if (/加减挡/.test(action)) {
    return {
      reason: 'C1 要按顺序完成加挡并让挡位与车速匹配；C2 则保持平顺速度控制。',
      watch: '看车速、发动机转速和前方道路余量，换挡期间保持方向稳定。',
    }
  }
  if (/左转|右转|路口/.test(action)) {
    return {
      reason: '进入路口前先减速、观察并提前打灯，转向动作应在确认冲突区域安全后开始。',
      watch: '扫视左右来车、行人和目标车道，转弯后确认车身进入正确车道并及时回正。',
    }
  }
  if (/学校|公共汽车站|公交/.test(action)) {
    return {
      reason: '人员密集区域需要提前降低速度并扩大观察范围，为突然横穿保留停车距离。',
      watch: '看道路两侧、站台/路边遮挡区域和前方可能进入车道的行人。',
    }
  }
  if (/会车/.test(action)) {
    return {
      reason: '会车时降低速度并保持本车在车道内，给对向车辆留出稳定横向安全空间。',
      watch: '看道路中心线、右侧边界和对向车辆轨迹，避免向中心线持续漂移。',
    }
  }
  if (/变更车道/.test(action)) {
    return {
      reason: '变道采用“观察 → 提前打灯 → 平缓横移 → 稳定目标车道”的完整动作链。',
      watch: '看左后方来车、目标车道间隙和横向位置，进入目标车道后逐步回正。',
    }
  }
  if (/超车/.test(action)) {
    return {
      reason: '超车需要先进入左侧车道、实际超过目标车辆并留出间距，再观察打右灯返回。',
      watch: '看左后方交通、被超车辆相对位置和返回原车道所需的前方净空。',
    }
  }
  if (/掉头/.test(action)) {
    return {
      reason: '掉头前先减速、观察并开启左转向灯，再沿考试路线连续完成大角度转向。',
      watch: '看对向来车、路口空间和车头/车尾扫掠范围，完成后及时稳定车道。',
    }
  }
  if (/靠边/.test(action)) {
    return {
      reason: '靠边停车要先观察打右灯，再平缓横移、低速收车，最终稳定停车并完成驻车操作。',
      watch: '看右侧边缘线、车身右侧间距和后方交通，目标是稳定落在规定距离内。',
    }
  }
  return {
    reason: '教练按科目三既有事件顺序和道路轨迹驾驶，并持续观察动态交通。',
    watch: '看远处路线、当前考试项目、前后车距和两侧潜在冲突目标。',
  }
}

function operationSummary(
  vehicle: CoachTeachingVehicle,
  automatic: boolean,
) {
  const speedKmh = Math.abs(vehicle.speed) * 3.6
  const gear = vehicle.gear < 0
    ? 'R 挡'
    : vehicle.gear === 0
      ? 'N 挡'
      : automatic
        ? 'D 挡'
        : `${vehicle.gear} 挡`
  const steeringTurns = Math.abs(vehicle.steeringWheelAngle) / (Math.PI * 2)
  const steering = steeringTurns < 0.02
    ? '方向盘回正'
    : `${vehicle.steeringWheelAngle < 0 ? '左' : '右'}打 ${steeringTurns.toFixed(2)} 圈`

  const controls: string[] = [
    gear,
    `${speedKmh.toFixed(1)} km/h`,
    steering,
  ]

  if (vehicle.brake > 0.05) controls.push(`制动 ${Math.round(vehicle.brake * 100)}%`)
  else if (vehicle.throttle > 0.05) controls.push(`油门 ${Math.round(vehicle.throttle * 100)}%`)

  if (!automatic && vehicle.clutch > 0.05) {
    controls.push(`离合 ${Math.round(vehicle.clutch * 100)}%`)
  }
  if (vehicle.handbrake) controls.push('手刹拉起')
  if (vehicle.leftIndicator) controls.push('左转向灯')
  if (vehicle.rightIndicator) controls.push('右转向灯')
  if (vehicle.highBeam) controls.push('远光灯')
  else if (vehicle.lowBeam) controls.push('近光灯')

  return controls.join(' · ')
}

export function buildCoachTeachingHint(
  input: CoachTeachingInput,
): CoachTeachingHint | null {
  const action = normalizedAction(input.status)
  if (!action) return null

  const teaching = input.examId === 'subject3'
    ? subject3Teaching(action)
    : subject2Teaching(action)

  return {
    action,
    ...teaching,
    operation: operationSummary(input.vehicle, input.automatic),
  }
}

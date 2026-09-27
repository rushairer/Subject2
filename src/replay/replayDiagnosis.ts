import { nearestReplaySample, type ReplayContextSample } from './replayContext'

export const DEFAULT_REPLAY_OPERATION_OFFSETS = [-3, -1.5, 0, 1.5, 3] as const

export interface ReplayOperationPoint<T extends ReplayContextSample> {
  offsetSeconds: number
  actualOffsetSeconds: number
  sample: T
}

export function replayOperationSlice<T extends ReplayContextSample>(
  samples: readonly T[],
  project: string | undefined,
  time: number | undefined,
  offsets: readonly number[] = DEFAULT_REPLAY_OPERATION_OFFSETS,
): ReplayOperationPoint<T>[] {
  if (project == null || time == null || !Number.isFinite(time)) return []

  const projectSamples = samples.filter(sample => sample.project === project)
  if (projectSamples.length === 0) return []

  const firstTime = projectSamples[0].t
  const lastTime = projectSamples[projectSamples.length - 1].t

  return offsets.flatMap(offsetSeconds => {
    const target = time + offsetSeconds
    if (target < firstTime || target > lastTime) return []

    const sample = nearestReplaySample(projectSamples, project, target)
    if (!sample || Math.abs(sample.t - target) > 0.5) return []

    return [{
      offsetSeconds,
      actualOffsetSeconds: sample.t - time,
      sample,
    }]
  })
}

export interface ReplayDiagnosisInput {
  id: string
  title: string
}

export interface ReplayDiagnosis {
  reason: string
  advice: string
}

function matchesId(id: string, base: string) {
  return id === base || id.startsWith(`${base}-`)
}

const genericDiagnosis: ReplayDiagnosis = {
  reason: '系统在该时刻记录了规则事件，需要结合轨迹和前后操作确认触发过程。',
  advice: '点击本条记录跳到对应轨迹时刻，重点对照前后 3 秒的车速、挡位、方向和信号状态，再按当前项目提示重新练习。',
}

export function replayDiagnosis(item: ReplayDiagnosisInput): ReplayDiagnosis {
  const { id, title } = item

  if (matchesId(id, 'reverse-before-first-control') || matchesId(id, 'reverse-before-opposite-control')) {
    return {
      reason: '开始倒车前没有先把两个前轮触地点完整驶过规定控制线。',
      advice: '先保持低速直行确认前轮越过控制线并停车，再挂倒挡开始下一段倒库动作。',
    }
  }
  if (matchesId(id, 'first-reverse-not-in-bay') || matchesId(id, 'second-reverse-not-in-bay')) {
    return {
      reason: '本次倒车阶段结束时车辆没有完整进入车库有效区域。',
      advice: '把重点放在后视镜中的库角、车身与边线关系，低速连续修正，确认车辆完整入库后再进入下一阶段。',
    }
  }
  if (matchesId(id, 'reverse-parking-body-out') || matchesId(id, 'side-parking-body-out-after-stop')) {
    return {
      reason: '车辆最终或过程中有部分车身越出项目允许区域。',
      advice: '降低速度并提前观察车身两侧边线；接近最终位置时减少大幅打轮，给车身回正留出距离。',
    }
  }
  if (matchesId(id, 'reverse-parking-timeout') || matchesId(id, 'side-parking-timeout')) {
    return {
      reason: '项目操作总时长超过规则限定时间。',
      advice: '保持低速但避免无效停顿；把观察点、打轮点和回正点形成固定节奏，减少重复修正。',
    }
  }
  if (
    matchesId(id, 'reverse-parking-stop') ||
    matchesId(id, 'side-parking-stop') ||
    matchesId(id, 'curve-stop') ||
    matchesId(id, 'right-angle-stop')
  ) {
    return {
      reason: '项目进行中出现了超过允许时长的停车。',
      advice: '用更低但连续的车速完成观察和修正，避免完全停住后再判断下一步。',
    }
  }
  if (matchesId(id, 'side-parking-line-contact') || matchesId(id, 'curve-wheel-line') || matchesId(id, 'right-angle-wheel-out') || matchesId(id, 'slope-wheel-line')) {
    return {
      reason: '车轮或车身轨迹已经接触项目边线，说明转向时机或横向余量不足。',
      advice: '回看触线前 3 秒的方向盘角度和车速；下一次更早修正并减小单次打轮幅度，持续保留边线安全余量。',
    }
  }
  if (matchesId(id, 'side-parking-exit-signal') || matchesId(id, 'right-angle-no-signal')) {
    return {
      reason: '进入规定转向/驶离动作前，没有正确使用要求的转向灯。',
      advice: '把“观察 → 打灯 → 再转向/驶离”固定成连续动作，不要等方向盘已经转动后再补灯。',
    }
  }
  if (matchesId(id, 'right-angle-signal-not-cancelled')) {
    return {
      reason: '完成直角转弯后转向灯仍保持开启。',
      advice: '车身回正、驶入新方向后立即检查并关闭转向灯，再继续后续操作。',
    }
  }
  if (matchesId(id, 'slope-stop-longitudinal-fail') || matchesId(id, 'slope-stop-longitudinal-10')) {
    return {
      reason: '定点停车时车辆纵向位置没有把前保险杠稳定控制在桩杆线要求范围内。',
      advice: '上坡阶段保持低速，提前使用固定参照点，接近停车点时用小幅制动精确收停，避免最后一刻大幅修正。',
    }
  }
  if (matchesId(id, 'slope-right-gap-fail') || matchesId(id, 'slope-right-gap-10')) {
    return {
      reason: '定点停车时车身与右侧道路边缘线距离过大。',
      advice: '上坡前先把车辆横向位置调整好，保持车身平行并持续通过右侧参照确认边距，再进入定点停车。',
    }
  }
  if (matchesId(id, 'slope-no-parking-brake')) {
    return {
      reason: '坡道停车后没有及时拉紧驻车制动器。',
      advice: '停车稳定后先完成驻车制动，再准备坡道起步，避免把停车和起步步骤混在一起。',
    }
  }
  if (matchesId(id, 'slope-start-timeout')) {
    return {
      reason: '车辆在坡道停车后没有在规定时间内完成起步。',
      advice: '停车后立即按固定起步顺序准备：挡位/离合或驱动力建立 → 松驻车制动 → 平稳起步，减少等待和反复试探。',
    }
  }
  if (matchesId(id, 'slope-rollback-fail') || matchesId(id, 'slope-rollback-10')) {
    return {
      reason: '坡道起步阶段驱动力建立不足或驻车制动释放过早，导致车辆后溜。',
      advice: '先建立足够驱动力再释放驻车制动；C1 尤其要稳定离合结合点，确认车辆已有向前趋势后再完全松开。',
    }
  }
  if (matchesId(id, 'curve-reverse')) {
    return {
      reason: '曲线行驶过程中出现倒车或未保持规定的连续前进路线。',
      advice: '进入 S 弯前把速度降到可连续控制的水平，使用小幅、连续的方向修正完成全程，不依赖倒车补救。',
    }
  }

  if (id === 'speed-control' || id.endsWith('-speed')) {
    return {
      reason: '当前道路/项目阶段的车速超过了该情景允许或合理的控制范围。',
      advice: '在进入路口、转弯、会车、学校/公交站等情景前提前收油减速，不要到事件区域内才急刹。',
    }
  }
  if (id === 'parking-brake') {
    return {
      reason: '车辆已经开始移动，但驻车制动器仍处于拉起状态。',
      advice: '起步顺序固定为安全带/挡位/观察/信号检查后释放驻车制动，再平稳给驱动力。',
    }
  }
  if (id.startsWith('engine-stall-')) {
    return {
      reason: '动力、挡位和离合配合失衡，发动机在当前操作中熄火。',
      advice: 'C1 起步和低速操作时减少离合释放速度，先稳定结合点并配合适量油门；熄火后按规范重新点火再继续。',
    }
  }
  if (id === 'seatbelt-not-fastened' || id === 'subject3-seatbelt') {
    return {
      reason: '车辆开始移动时安全带仍未系好。',
      advice: '把安全带放在所有起步动作之前：系好安全带后再点火、挂挡、观察和起步。',
    }
  }
  if (id === 'subject3-night-lights-off') {
    return {
      reason: '夜间车辆已经行驶，但前照灯没有处于开启状态。',
      advice: '夜间起步前先完成灯光状态检查，确认近光或当前情景要求的灯光已开启后再移动车辆。',
    }
  }
  if (id === 'subject3-light-test') {
    return {
      reason: '模拟夜间灯光考试的操作与当前语音指令要求不匹配。',
      advice: '先听完整条指令再操作灯光；远近光切换题要完成完整状态变化，不要只按一次按键就立即进入下一题。',
    }
  }
  if (id === 'subject3-road-boundary') {
    return {
      reason: '车辆完整车身范围已经超出当前道路可行驶区域。',
      advice: '提前保持车道中心和足够横向余量；转弯时兼顾车头与后轮内轮差，不要只看车辆中心点。',
    }
  }
  if (id.includes('collision')) {
    return {
      reason: '车辆与交通参与者或道路设施发生了实际空间碰撞。',
      advice: '更早观察并预留制动/横向避让空间；有动态冲突时优先减速停车，不用临近障碍后的急转向来补救。',
    }
  }

  if (id.endsWith('-signal-lead') || id.endsWith('-right-signal-lead')) {
    return {
      reason: '转向、变道或返回车道开始得过早，转向灯开启后的提前量不足。',
      advice: '先观察，再开启对应转向灯并保持足够提前时间，确认安全后才开始明显转向或横向移动。',
    }
  }
  if (id.endsWith('-left-signal') || id.endsWith('-right-signal') || id.endsWith('-signal')) {
    return {
      reason: '规定的转向、变道、超车或停车动作前没有正确使用对应转向灯。',
      advice: '把信号灯作为动作前置条件：先观察并打灯，确认方向正确后再开始车辆横向动作。',
    }
  }
  if (id.endsWith('-right-observation') || id.endsWith('-observation')) {
    return {
      reason: '进入当前道路动作前或过程中，没有完成要求的侧方/后方交通观察。',
      advice: '在动作开始前完成对应方向和后方观察；慢行区域要同时确认左右交通情况，再继续通过。',
    }
  }
  if (id.endsWith('-direction')) {
    return {
      reason: '直线行驶阶段方向盘修正幅度过大，车辆方向稳定性不足。',
      advice: '视线放远，用小幅、低频的方向修正保持车道，不要连续大幅左右修方向。',
    }
  }
  if (id.endsWith('-skip-gear')) {
    return {
      reason: '手动挡加挡过程中跳过了相邻挡位。',
      advice: '按顺序逐级升挡，每次完成离合与挡位结合后再进入下一挡。',
    }
  }
  if (id.endsWith('-high-gear-duration')) {
    return {
      reason: '虽然达到要求的较高挡位，但保持时间不足。',
      advice: '完成升挡后保持稳定车速和挡位一段时间，再根据后续道路条件减挡。',
    }
  }
  if (id.endsWith('-gear')) {
    return {
      reason: '加减挡项目中没有达到要求的挡位状态。',
      advice: '提前建立顺序升挡节奏，避免在项目末端才集中换挡；保持发动机和车速与挡位匹配。',
    }
  }
  if (id.endsWith('-yield')) {
    return {
      reason: '存在实际行人冲突时，没有完成有效停车礼让。',
      advice: '接近人行横道先降速观察；检测到行人占用冲突区域时停车等待，确认通行空间恢复后再起步。',
    }
  }
  if (
    id.endsWith('-opposite-lane') ||
    id.endsWith('-target-pass') ||
    id.endsWith('-return-path') ||
    id.endsWith('-completion') ||
    id.endsWith('-path')
  ) {
    return {
      reason: '车辆没有按当前项目要求完成规定的车道位置或完整行驶路径。',
      advice: '先明确目标车道和动作结束位置；变道/超车要完成“进入目标位置 → 保持/通过 → 回到要求位置”的完整闭环。',
    }
  }
  if (id.includes('pull-over') || title.includes('靠边停车') || title.includes('停车后车身距离')) {
    return {
      reason: '靠边停车的停车稳定性、驻车步骤或右侧边距没有达到要求。',
      advice: '提前打右灯并观察，低速贴近右侧后平行车身；稳定停车后挂空挡并拉驻车制动，再结束项目。',
    }
  }

  return genericDiagnosis
}

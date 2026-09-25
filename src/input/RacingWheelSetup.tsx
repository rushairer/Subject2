import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  detectMovedAxis,
  findPreferredRacingWheel,
  loadRacingWheelMapping,
  removeRacingWheelMapping,
  saveRacingWheelMapping,
  snapshotAxes,
  type RacingWheelMapping,
} from './racingWheel'

type CalibrationStep = 'idle' | 'center' | 'left' | 'right' | 'throttle' | 'brake' | 'clutch'

interface CalibrationDraft {
  centerAxes: number[]
  steeringIndex?: number
  left?: number
  right?: number
  throttleIndex?: number
  throttlePressed?: number
  brakeIndex?: number
  brakePressed?: number
  clutchIndex?: number
  clutchPressed?: number
}

function shortDeviceName(id: string) {
  return id.length > 74 ? id.slice(0, 71) + '…' : id
}

export function RacingWheelSetup() {
  const [device, setDevice] = useState<Gamepad | null>(() => findPreferredRacingWheel())
  const [mapping, setMapping] = useState<RacingWheelMapping | null>(() => {
    const initial = findPreferredRacingWheel()
    return initial ? loadRacingWheelMapping(initial.id) : null
  })
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<CalibrationStep>('idle')
  const [draft, setDraft] = useState<CalibrationDraft | null>(null)
  const [message, setMessage] = useState('')

  const refresh = useCallback(() => {
    const next = findPreferredRacingWheel()
    setDevice(next)
    setMapping(next ? loadRacingWheelMapping(next.id) : null)
  }, [])

  useEffect(() => {
    const connected = () => refresh()
    const disconnected = () => refresh()
    window.addEventListener('gamepadconnected', connected)
    window.addEventListener('gamepaddisconnected', disconnected)
    const timer = window.setInterval(refresh, 1000)
    return () => {
      window.removeEventListener('gamepadconnected', connected)
      window.removeEventListener('gamepaddisconnected', disconnected)
      window.clearInterval(timer)
    }
  }, [refresh])

  const status = useMemo(() => {
    if (!device) return '未检测到方向盘'
    if (mapping) return '已连接 · 已校准'
    return '已连接 · 待校准'
  }, [device, mapping])

  const currentDevice = () => {
    const current = findPreferredRacingWheel()
    if (!current) {
      setMessage('未检测到设备。请在 Windows 中连接方向盘，并转动方向盘或按任意按钮一次。')
      return null
    }
    return current
  }

  const begin = () => {
    const current = currentDevice()
    if (!current) return
    setDraft(null)
    setMessage('')
    setStep('center')
  }

  const recordCenter = () => {
    const current = currentDevice()
    if (!current) return
    setDraft({ centerAxes: snapshotAxes(current) })
    setStep('left')
    setMessage('中位已记录。现在把方向盘打到最左极限，再点击“记录左极限”。')
  }

  const recordLeft = () => {
    const current = currentDevice()
    if (!current || !draft) return
    const axes = snapshotAxes(current)
    const index = detectMovedAxis(draft.centerAxes, axes)
    if (index == null) {
      setMessage('没有检测到明显变化的轴，请确认方向盘已经打到左极限。')
      return
    }
    setDraft({ ...draft, steeringIndex: index, left: axes[index] ?? 0 })
    setStep('right')
    setMessage('左极限已记录。现在把方向盘打到最右极限。')
  }

  const recordRight = () => {
    const current = currentDevice()
    if (!current || !draft || draft.steeringIndex == null) return
    const axes = snapshotAxes(current)
    const right = axes[draft.steeringIndex] ?? 0
    if (Math.abs(right - (draft.left ?? 0)) < 0.5) {
      setMessage('左右极限跨度太小，请确认方向盘已经打到最右极限。')
      return
    }
    setDraft({ ...draft, right })
    setStep('throttle')
    setMessage('方向盘已校准。松开所有踏板，然后把油门踩到底并点击记录。')
  }

  const recordPedal = (kind: 'throttle' | 'brake' | 'clutch') => {
    const current = currentDevice()
    if (!current || !draft || draft.steeringIndex == null) return
    const axes = snapshotAxes(current)
    const excluded = [
      draft.steeringIndex,
      ...(draft.throttleIndex != null ? [draft.throttleIndex] : []),
      ...(draft.brakeIndex != null ? [draft.brakeIndex] : []),
    ]
    const index = detectMovedAxis(draft.centerAxes, axes, excluded)
    if (index == null) {
      setMessage('没有检测到明显变化的踏板轴。请把当前踏板踩到底后再记录。')
      return
    }

    if (kind === 'throttle') {
      setDraft({ ...draft, throttleIndex: index, throttlePressed: axes[index] ?? 0 })
      setStep('brake')
      setMessage('油门已记录。松开油门，把刹车踩到底并记录。')
      return
    }
    if (kind === 'brake') {
      setDraft({ ...draft, brakeIndex: index, brakePressed: axes[index] ?? 0 })
      setStep('clutch')
      setMessage('刹车已记录。如果有第三踏板，把离合踩到底记录；两踏板 T598P 可直接跳过。')
      return
    }
    setDraft({ ...draft, clutchIndex: index, clutchPressed: axes[index] ?? 0 })
    save(false, { ...draft, clutchIndex: index, clutchPressed: axes[index] ?? 0 })
  }

  const save = (skipClutch = false, source = draft) => {
    const current = currentDevice()
    if (
      !current ||
      !source ||
      source.steeringIndex == null ||
      source.left == null ||
      source.right == null ||
      source.throttleIndex == null ||
      source.throttlePressed == null ||
      source.brakeIndex == null ||
      source.brakePressed == null
    ) return

    const center = source.centerAxes[source.steeringIndex] ?? 0
    const next: RacingWheelMapping = {
      deviceId: current.id,
      steering: {
        index: source.steeringIndex,
        left: source.left,
        center,
        right: source.right,
      },
      throttle: {
        index: source.throttleIndex,
        rest: source.centerAxes[source.throttleIndex] ?? 0,
        pressed: source.throttlePressed,
      },
      brake: {
        index: source.brakeIndex,
        rest: source.centerAxes[source.brakeIndex] ?? 0,
        pressed: source.brakePressed,
      },
      clutch:
        !skipClutch && source.clutchIndex != null && source.clutchPressed != null
          ? {
              index: source.clutchIndex,
              rest: source.centerAxes[source.clutchIndex] ?? 0,
              pressed: source.clutchPressed,
            }
          : undefined,
      calibratedAt: Date.now(),
    }
    saveRacingWheelMapping(next)
    setMapping(next)
    setStep('idle')
    setMessage('校准完成。进入训练后会优先使用方向盘和踏板输入。')
  }

  const clear = () => {
    if (!device) return
    removeRacingWheelMapping(device.id)
    setMapping(null)
    setStep('idle')
    setDraft(null)
    setMessage('已清除校准，可以重新校准。')
  }

  return <section className="wheel-device">
    <button className="wheel-device-summary" onClick={() => setOpen(value => !value)}>
      <span className={device ? 'wheel-device-dot connected' : 'wheel-device-dot'} />
      <div>
        <strong>方向盘设备</strong>
        <span>{status}</span>
      </div>
      <b>{open ? '收起' : '设置'}</b>
    </button>

    {open && <div className="wheel-device-panel">
      <div className="wheel-device-name">
        <span>{device ? shortDeviceName(device.id) : '未检测到设备'}</span>
        {device && <small>{device.axes.length} axes · {device.buttons.length} buttons</small>}
      </div>

      {!device && <p>建议在 Windows 10/11 的 Chrome 或 Edge 中使用。连接 T598P 后，先转动方向盘或按任意按钮，让浏览器激活 Gamepad API。</p>}

      {device && step === 'idle' && <div className="wheel-device-actions">
        <button className="primary" onClick={begin}>{mapping ? '重新校准' : '开始校准'}</button>
        {mapping && <button className="ghost-btn" onClick={clear}>清除校准</button>}
      </div>}

      {device && step !== 'idle' && <div className="wheel-calibration">
        <div className="wheel-calibration-step">
          {step === 'center' && '1 / 6 · 方向盘回正，所有踏板松开'}
          {step === 'left' && '2 / 6 · 方向盘最左极限'}
          {step === 'right' && '3 / 6 · 方向盘最右极限'}
          {step === 'throttle' && '4 / 6 · 油门踩到底'}
          {step === 'brake' && '5 / 6 · 刹车踩到底'}
          {step === 'clutch' && '6 / 6 · 离合踩到底（可选）'}
        </div>
        {step === 'center' && <button className="primary" onClick={recordCenter}>记录中位与踏板松开值</button>}
        {step === 'left' && <button className="primary" onClick={recordLeft}>记录左极限</button>}
        {step === 'right' && <button className="primary" onClick={recordRight}>记录右极限</button>}
        {step === 'throttle' && <button className="primary" onClick={() => recordPedal('throttle')}>记录油门</button>}
        {step === 'brake' && <button className="primary" onClick={() => recordPedal('brake')}>记录刹车</button>}
        {step === 'clutch' && <div className="wheel-device-actions">
          <button className="primary" onClick={() => recordPedal('clutch')}>记录离合</button>
          <button className="ghost-btn" onClick={() => save(true)}>两踏板，跳过离合</button>
        </div>}
        <button className="wheel-cancel" onClick={() => { setStep('idle'); setDraft(null); setMessage('') }}>取消</button>
      </div>}

      {message && <p className="wheel-device-message">{message}</p>}
      {mapping && <p className="wheel-device-note">校准保存在当前浏览器。本阶段支持方向、油门、刹车和可选离合；灯光、喇叭、挡位按钮仍可同时使用键盘。</p>}
    </div>}
  </section>
}

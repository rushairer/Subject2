import { useMemo, useState } from 'react'
import {
  buildDrivingDynamicsTimeline,
  dynamicsGearLabel,
  type DrivingDynamicsSample,
} from './drivingDynamicsTimeline'

const VIEW_WIDTH = 1000
const VIEW_HEIGHT = 230
const SPEED_TOP = 24
const SPEED_BOTTOM = 132
const GEAR_TOP = 158
const GEAR_BOTTOM = 214

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function timeX(t: number, start: number, duration: number) {
  if (duration <= 0) return 0
  return clamp01((t - start) / duration) * VIEW_WIDTH
}

function speedY(speedKmh: number, speedScaleMax: number) {
  const ratio = clamp01(speedKmh / Math.max(1, speedScaleMax))
  return SPEED_BOTTOM - ratio * (SPEED_BOTTOM - SPEED_TOP)
}

function gearValue(gear: number) {
  return Math.max(-1, Math.min(5, gear))
}

function gearY(gear: number) {
  const ratio = (gearValue(gear) + 1) / 6
  return GEAR_BOTTOM - ratio * (GEAR_BOTTOM - GEAR_TOP)
}

function speedPath(
  samples: ReturnType<typeof buildDrivingDynamicsTimeline>['chartSamples'],
  start: number,
  duration: number,
  speedScaleMax: number,
) {
  return samples.map((sample, index) => {
    const x = timeX(sample.t, start, duration)
    const y = speedY(Math.abs(sample.speed) * 3.6, speedScaleMax)
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
}

function gearPath(
  samples: ReturnType<typeof buildDrivingDynamicsTimeline>['chartSamples'],
  start: number,
  duration: number,
) {
  if (samples.length === 0) return ''
  const first = samples[0]
  let path = `M ${timeX(first.t, start, duration).toFixed(2)} ${gearY(first.gear).toFixed(2)}`
  for (let index = 1; index < samples.length; index += 1) {
    const sample = samples[index]
    const x = timeX(sample.t, start, duration)
    const y = gearY(sample.gear)
    path += ` H ${x.toFixed(2)} V ${y.toFixed(2)}`
  }
  return path
}

function durationLabel(seconds: number) {
  if (seconds < 60) return `${seconds.toFixed(1)} 秒`
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.round(seconds % 60)
  return `${minutes} 分 ${remainder} 秒`
}

export function DrivingDynamicsTimeline({
  samples,
  projectLabel,
  onSelect,
}: {
  samples: readonly DrivingDynamicsSample[]
  projectLabel: (project: string) => string
  onSelect: (project: string, time: number) => void
}) {
  const model = useMemo(
    () => buildDrivingDynamicsTimeline(samples),
    [samples],
  )
  const [cursorIndex, setCursorIndex] = useState(0)

  if (model.samples.length < 2) return null

  const safeCursorIndex = Math.max(
    0,
    Math.min(model.samples.length - 1, cursorIndex),
  )
  const current = model.samples[safeCursorIndex]
  const speedScaleMax = Math.max(
    10,
    Math.ceil(model.maxSpeedKmh / 10) * 10,
  )
  const currentX = timeX(
    current.t,
    model.startTime,
    model.durationSeconds,
  )
  const currentSpeedY = speedY(
    Math.abs(current.speed) * 3.6,
    speedScaleMax,
  )
  const currentGearY = gearY(current.gear)

  return <section className="replay-dynamics" aria-labelledby="replay-dynamics-title">
    <div className="replay-dynamics-head">
      <div>
        <div className="eyebrow">DRIVING DYNAMICS</div>
        <h3 id="replay-dynamics-title">速度 / 挡位时间轴</h3>
      </div>
      <p>
        沿整场轨迹查看速度与挡位变化。拖动游标后可直接定位到对应项目的轨迹证据；
        该图用于复盘驾驶节奏，不参与考试评分。
      </p>
    </div>

    <div className="replay-dynamics-meta">
      <i>总时长 {durationLabel(model.durationSeconds)}</i>
      <i>最高速度 {model.maxSpeedKmh.toFixed(1)} km/h</i>
      <i>挡位变化 {model.gearChanges.length} 次</i>
    </div>

    <div className="replay-dynamics-chart">
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label="整场训练速度曲线与挡位变化图"
      >
        <line className="replay-dynamics-grid" x1="0" x2={VIEW_WIDTH} y1={SPEED_BOTTOM} y2={SPEED_BOTTOM} />
        <line className="replay-dynamics-grid" x1="0" x2={VIEW_WIDTH} y1={SPEED_TOP} y2={SPEED_TOP} />
        <line className="replay-dynamics-divider" x1="0" x2={VIEW_WIDTH} y1="146" y2="146" />
        <path
          className="replay-dynamics-speed"
          d={speedPath(model.chartSamples, model.startTime, model.durationSeconds, speedScaleMax)}
        />
        <path
          className="replay-dynamics-gear"
          d={gearPath(model.chartSamples, model.startTime, model.durationSeconds)}
        />
        <line
          className="replay-dynamics-cursor"
          x1={currentX}
          x2={currentX}
          y1="12"
          y2="218"
        />
        <circle className="replay-dynamics-speed-point" cx={currentX} cy={currentSpeedY} r="6" />
        <circle className="replay-dynamics-gear-point" cx={currentX} cy={currentGearY} r="5" />
        <text className="replay-dynamics-label" x="8" y="18">速度</text>
        <text className="replay-dynamics-label" x="8" y="156">挡位</text>
        <text className="replay-dynamics-scale" x={VIEW_WIDTH - 8} y="18" textAnchor="end">
          {speedScaleMax} km/h
        </text>
        <text className="replay-dynamics-scale" x={VIEW_WIDTH - 8} y={SPEED_BOTTOM - 6} textAnchor="end">
          0
        </text>
      </svg>
    </div>

    <input
      className="replay-dynamics-scrubber"
      type="range"
      min={0}
      max={model.samples.length - 1}
      step={1}
      value={safeCursorIndex}
      onChange={event => setCursorIndex(Number(event.target.value))}
      aria-label="速度和挡位时间轴游标"
    />

    <div className="replay-dynamics-readout">
      <span><b>{(current.t - model.startTime).toFixed(1)}s</b><small>相对时间</small></span>
      <span><b>{projectLabel(current.project)}</b><small>当前项目</small></span>
      <span><b>{(Math.abs(current.speed) * 3.6).toFixed(1)}</b><small>km/h</small></span>
      <span><b>{dynamicsGearLabel(current)}</b><small>挡位</small></span>
      <button
        type="button"
        className="replay-focus-evidence-btn"
        onClick={() => onSelect(current.project, current.t)}
      >
        定位到这段轨迹
      </button>
    </div>
  </section>
}

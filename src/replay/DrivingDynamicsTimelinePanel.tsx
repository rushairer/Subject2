import { useMemo, useState } from 'react'
import {
  buildDrivingDynamicsEventMarkers,
  type DrivingDynamicsEventKind,
  type DrivingDynamicsEventMarker,
  type DrivingDynamicsEventSample,
} from './drivingDynamicsEvents'
import {
  buildDrivingDynamicsTimeline,
  dynamicsGearLabel,
} from './drivingDynamicsTimeline'

const VIEW_WIDTH = 1000
const VIEW_HEIGHT = 230
const SPEED_TOP = 24
const SPEED_BOTTOM = 132
const GEAR_TOP = 158
const GEAR_BOTTOM = 214

const EVENT_OFFSETS: Record<DrivingDynamicsEventKind, number> = {
  'sudden-brake': 16,
  'cut-in': 32,
  pedestrian: 48,
}

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

function eventY(
  kind: DrivingDynamicsEventKind,
  curveY: number,
) {
  const offset = EVENT_OFFSETS[kind]
  return curveY < (SPEED_TOP + SPEED_BOTTOM) / 2
    ? Math.min(SPEED_BOTTOM - 8, curveY + offset)
    : Math.max(SPEED_TOP + 8, curveY - offset)
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
  selectedEventId,
  projectLabel,
  onSelect,
}: {
  samples: readonly DrivingDynamicsEventSample[]
  selectedEventId?: string | null
  projectLabel: (project: string) => string
  onSelect: (project: string, time: number, eventId?: string) => void
}) {
  const model = useMemo(
    () => buildDrivingDynamicsTimeline(samples),
    [samples],
  )
  const events = useMemo(
    () => buildDrivingDynamicsEventMarkers(model.samples),
    [model.samples],
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

  const focusEvent = (event: DrivingDynamicsEventMarker) => {
    setCursorIndex(event.sampleIndex)
    onSelect(event.project, event.t, event.id)
  }

  const selectedEvent =
    events.find(event => event.id === selectedEventId) ?? null

  return <section className="replay-dynamics" aria-labelledby="replay-dynamics-title">
    <div className="replay-dynamics-head">
      <div>
        <div className="eyebrow">DRIVING DYNAMICS</div>
        <h3 id="replay-dynamics-title">速度 / 挡位时间轴</h3>
      </div>
      <p>
        沿整场轨迹查看速度与挡位变化；前车急刹、电动车加塞和行人横穿会直接标在速度曲线上。
        拖动游标或点击事件均可定位轨迹证据，该图不参与考试评分。
      </p>
    </div>

    <div className="replay-dynamics-meta">
      <i>总时长 {durationLabel(model.durationSeconds)}</i>
      <i>最高速度 {model.maxSpeedKmh.toFixed(1)} km/h</i>
      <i>挡位变化 {model.gearChanges.length} 次</i>
      <i>危险事件 {events.length} 个</i>
    </div>

    <div className="replay-dynamics-chart">
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label="整场训练速度曲线、挡位变化与危险交通事件图"
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
        {events.map(event => {
          const x = timeX(event.t, model.startTime, model.durationSeconds)
          const curveY = speedY(event.speedKmh, speedScaleMax)
          const markerY = eventY(event.kind, curveY)
          const selected = selectedEventId === event.id
          return <g
            key={event.id}
            className={`replay-dynamics-event ${event.kind}${selected ? ' selected' : ''}`}
            transform={`translate(${x.toFixed(2)} ${markerY.toFixed(2)})`}
            role="button"
            tabIndex={0}
            aria-label={`${event.label} · 点击查看轨迹证据`}
            aria-pressed={selected}
            onClick={() => focusEvent(event)}
            onKeyDown={keyboardEvent => {
              if (keyboardEvent.key !== 'Enter' && keyboardEvent.key !== ' ') return
              keyboardEvent.preventDefault()
              focusEvent(event)
            }}
          >
            <title>{event.label} · 点击查看轨迹证据</title>
            <line x1="0" x2="0" y1="0" y2={(curveY - markerY).toFixed(2)} />
            <circle r="11" />
            <text x="0" y="4" textAnchor="middle">{event.glyph}</text>
          </g>
        })}
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

    {events.length > 0 && <div className="replay-dynamics-events" aria-label="危险交通事件">
      {events.map(event => {
        const selected = selectedEventId === event.id
        return <button
          type="button"
          key={event.id}
          className={`replay-dynamics-event-chip ${event.kind}${selected ? ' selected' : ''}`}
          aria-pressed={selected}
          onClick={() => focusEvent(event)}
        >
          <b>{event.label}</b>
          <small>
            {(event.t - model.startTime).toFixed(1)}s · {event.speedKmh.toFixed(1)} km/h
          </small>
        </button>
      })}
    </div>}

    {selectedEvent && <div className="replay-dynamics-current-event" role="status">
      <b>当前事件 · {selectedEvent.label}</b>
      <span>
        {(selectedEvent.t - model.startTime).toFixed(1)}s · {selectedEvent.speedKmh.toFixed(1)} km/h · 对应教练证据卡已高亮
      </span>
    </div>}

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
        onClick={() => onSelect(current.project, current.t, undefined)}
      >
        定位到这段轨迹
      </button>
    </div>
  </section>
}

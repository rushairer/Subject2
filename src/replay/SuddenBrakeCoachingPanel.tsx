import { useMemo } from 'react'
import { DRIVING_RULES } from '../rules/drivingRules'
import {
  buildSuddenBrakeCoachingReport,
  type SuddenBrakeCoachingEvent,
  type SuddenBrakeCoachingSample,
} from '../coaching/suddenBrakeCoaching'
import { drivingDynamicsEventId } from './drivingDynamicsEvents'

function seconds(value: number | undefined) {
  return value == null ? '--' : `${value.toFixed(1)} 秒`
}

function responseSummary(event: SuddenBrakeCoachingEvent) {
  const rules = DRIVING_RULES.subject3.suddenBrakeCoaching
  const throttle =
    event.baselineThrottle == null
      ? '松油：旧轨迹未记录油门'
      : event.baselineThrottle < rules.throttleReleaseDelta
        ? '松油：触发时油门已在低位'
        : event.throttleReleaseSeconds != null
          ? `松油反应 ${event.throttleReleaseSeconds.toFixed(1)} 秒`
          : '松油：反应窗内未检测到明显回收'

  const brake = event.brakeReactionSeconds != null
    ? `制动反应 ${event.brakeReactionSeconds.toFixed(1)} 秒 · 最大制动 ${Math.round(event.maximumBrake * 100)}%`
    : '制动：反应窗内未检测到明显输入'

  return { throttle, brake }
}

function riskSummary(event: SuddenBrakeCoachingEvent) {
  const parts = [
    `前车减速度约 ${event.leadDecelerationMps2.toFixed(1)} m/s²`,
    `触发时距 ${event.triggerTimeGapSeconds.toFixed(1)} 秒`,
  ]
  if (event.minimumTimeGapSeconds != null) {
    parts.push(`最小时距 ${event.minimumTimeGapSeconds.toFixed(1)} 秒`)
  }
  if (event.minimumGapMeters != null) {
    parts.push(`最小净距 ${event.minimumGapMeters.toFixed(1)} m`)
  }
  if (event.minimumTimeToCollisionSeconds != null) {
    parts.push(`最低 TTC ${event.minimumTimeToCollisionSeconds.toFixed(1)} 秒`)
  }
  return parts.join(' · ')
}

export function SuddenBrakeCoachingPanel({
  samples,
  selectedEventId,
  onSelect,
}: {
  samples: readonly SuddenBrakeCoachingSample[]
  selectedEventId?: string | null
  onSelect: (time: number, eventId: string) => void
}) {
  const report = useMemo(
    () => buildSuddenBrakeCoachingReport(samples),
    [samples],
  )

  if (report.scenarioSampleCount < 2) return null

  return <section className="replay-focus sudden-brake-coaching" aria-labelledby="sudden-brake-coaching-title">
    <div className="replay-focus-head">
      <div>
        <div className="eyebrow">DEFENSIVE RESPONSE COACHING</div>
        <h3 id="sudden-brake-coaching-title">前车急减速反应观察</h3>
      </div>
      <p className="replay-focus-description">
        复盘脚本化前车急减速场景里的松油、制动和车距变化。
        反应时间来自本模拟器轨迹，只用于训练观察，不新增考试扣分或事故责任判断。
      </p>
    </div>

    <div className="replay-focus-meta">
      <i>急减速前车样本 {report.scenarioSampleCount} 个</i>
      <i>可分析触发 {report.events.length} 次</i>
      <i>反应窗 {seconds(DRIVING_RULES.subject3.suddenBrakeCoaching.reactionWindowSeconds)}</i>
    </div>

    <div className="replay-focus-grid">
      {report.events.length === 0
        ? <article className="replay-focus-card" aria-label="前车急减速反应观察有效触发不足">
            <span className="replay-focus-rank">—</span>
            <span className="replay-focus-copy">
              <strong>已记录急减速场景，但没有形成可分析的近距触发</strong>
              <span>可能是与前车距离较远、车速较低，或采样时没有捕获到足够连续的明显减速。</span>
              <span className="replay-focus-practice">
                <b>说明</b>
                没有触发不代表表现好或差；本模块只在证据足够时给出反应时间。
              </span>
            </span>
          </article>
        : report.events.map((event, index) => {
            const response = responseSummary(event)
            const eventId = drivingDynamicsEventId('sudden-brake', event.vehicleId, event.triggerTime)
            const selected = selectedEventId === eventId
            return <article
              className={`replay-focus-card${selected ? ' selected-evidence' : ''}`}
              key={eventId}
              data-replay-event-id={eventId}
              aria-label={`前车急减速反应观察 ${index + 1}`}
            >
              <span className="replay-focus-rank">{index + 1}</span>
              <span className="replay-focus-copy">
                <strong>前车明显急减速 · 反应证据</strong>
                {selected && <span className="replay-focus-current">时间轴当前事件</span>}
                <span>{riskSummary(event)}</span>
                <span className="replay-focus-practice">
                  <b>踏板反应</b>
                  {response.throttle}；{response.brake}。
                </span>
                <span className="replay-focus-practice">
                  <b>训练建议</b>
                  结合轨迹检查是否提前留出余量、及时收油并按需要平顺制动。
                  未检测到制动输入不自动判错，也可能存在其他避险操作。
                </span>
                <span className="replay-focus-actions">
                  <button
                    type="button"
                    className="replay-focus-evidence-btn"
                    aria-pressed={selected}
                    onClick={() => onSelect(event.representativeTime, eventId)}
                  >
                    查看这段轨迹证据
                  </button>
                </span>
              </span>
            </article>
          })}
    </div>
  </section>
}

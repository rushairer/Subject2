import { useMemo } from 'react'
import { DRIVING_RULES } from '../rules/drivingRules'
import {
  buildCutInResponseCoachingReport,
  type CutInResponseCoachingEvent,
  type CutInResponseCoachingSample,
} from '../coaching/cutInResponseCoaching'

function seconds(value: number | undefined) {
  return value == null ? '--' : `${value.toFixed(1)} 秒`
}

function responseSummary(event: CutInResponseCoachingEvent) {
  const rules = DRIVING_RULES.subject3.cutInCoaching
  const throttle =
    event.baselineThrottle == null
      ? '松油：旧轨迹未记录油门'
      : event.baselineThrottle < rules.throttleReleaseDelta
        ? '松油：触发时油门已在低位'
        : event.throttleReleaseSeconds != null
          ? `松油反应 ${event.throttleReleaseSeconds.toFixed(1)} 秒`
          : '松油：反应窗内未检测到明显回收'

  const brake =
    event.brakeReactionSeconds != null
      ? `制动反应 ${event.brakeReactionSeconds.toFixed(1)} 秒 · 最大制动 ${Math.round(event.maximumBrake * 100)}%`
      : '制动：反应窗内未检测到明显输入'

  const steering =
    event.maximumSteeringWheelChangeRadians == null
      ? '方向：旧轨迹未记录方向盘'
      : `方向盘最大变化 ${(
          event.maximumSteeringWheelChangeRadians /
          (Math.PI * 2)
        ).toFixed(2)} 圈`

  return { throttle, brake, steering }
}

function riskSummary(event: CutInResponseCoachingEvent) {
  const parts = [
    `进入冲突时纵向差 ${event.triggerAheadMeters.toFixed(1)} m`,
    `横向差 ${Math.abs(event.triggerLateralMeters).toFixed(1)} m`,
  ]
  if (event.minimumPlanarDistanceMeters != null) {
    parts.push(`最近中心距离约 ${event.minimumPlanarDistanceMeters.toFixed(1)} m`)
  }
  if (event.minimumTimeToLongitudinalMeetSeconds != null) {
    parts.push(
      `最低纵向相遇时间 ${event.minimumTimeToLongitudinalMeetSeconds.toFixed(1)} 秒`,
    )
  }
  return parts.join(' · ')
}

export function CutInResponseCoachingPanel({
  samples,
  onSelect,
}: {
  samples: readonly CutInResponseCoachingSample[]
  onSelect: (time: number) => void
}) {
  const report = useMemo(
    () => buildCutInResponseCoachingReport(samples),
    [samples],
  )

  if (report.scenarioSampleCount < 2) return null

  return (
    <section
      className="replay-focus cut-in-response-coaching"
      aria-labelledby="cut-in-response-coaching-title"
    >
      <div className="replay-focus-head">
        <div>
          <div className="eyebrow">CUT-IN RESPONSE COACHING</div>
          <h3 id="cut-in-response-coaching-title">电动车加塞反应观察</h3>
        </div>
        <p className="replay-focus-description">
          复盘脚本化电动车从路侧切入本车道时的收油、制动和方向变化。
          距离与反应时间来自本模拟器轨迹，只用于训练观察，不新增考试扣分或事故责任判断。
        </p>
      </div>

      <div className="replay-focus-meta">
        <i>加塞场景样本 {report.scenarioSampleCount} 个</i>
        <i>可分析冲突 {report.events.length} 次</i>
        <i>
          反应窗 {seconds(DRIVING_RULES.subject3.cutInCoaching.reactionWindowSeconds)}
        </i>
      </div>

      <div className="replay-focus-grid">
        {report.events.length === 0 ? (
          <article
            className="replay-focus-card"
            aria-label="电动车加塞反应观察有效冲突不足"
          >
            <span className="replay-focus-rank">—</span>
            <span className="replay-focus-copy">
              <strong>已记录加塞场景，但没有形成可分析的近距冲突</strong>
              <span>
                可能是与电动车纵向距离较远、候考车速较低，或采样没有连续覆盖进入本车道的瞬间。
              </span>
              <span className="replay-focus-practice">
                <b>说明</b>
                没有触发不代表表现好或差；本模块只在证据足够时展示反应过程。
              </span>
            </span>
          </article>
        ) : (
          report.events.map((event, index) => {
            const response = responseSummary(event)
            return (
              <article
                className="replay-focus-card"
                key={`${event.hazardId}-${event.triggerTime}`}
                aria-label={`电动车加塞反应观察 ${index + 1}`}
              >
                <span className="replay-focus-rank">{index + 1}</span>
                <span className="replay-focus-copy">
                  <strong>电动车切入本车道 · 反应证据</strong>
                  <span>{riskSummary(event)}</span>
                  <span className="replay-focus-practice">
                    <b>操作反应</b>
                    {response.throttle}；{response.brake}；{response.steering}。
                  </span>
                  <span className="replay-focus-practice">
                    <b>训练建议</b>
                    结合轨迹检查是否提前留出空间、及时收油，并按实际风险选择平顺制动或方向调整。
                    未检测到某一种操作不自动判错，因为真实避险可能采用不同组合。
                  </span>
                  <span className="replay-focus-actions">
                    <button
                      type="button"
                      className="replay-focus-evidence-btn"
                      onClick={() => onSelect(event.representativeTime)}
                    >
                      查看这段轨迹证据
                    </button>
                  </span>
                </span>
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}

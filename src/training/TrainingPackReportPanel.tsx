import { useMemo } from 'react'
import type { ReplayTrainingProjectId } from '../replay/replayTrainingFocus'
import {
  buildTrainingPackReport,
  type TrainingPackStageResult,
  type TrainingPackTrend,
} from './trainingPackReport'
import {
  trainingPackById,
  type TrainingPackId,
} from './trainingPacks'
import {
  compareTrainingPackRounds,
  loadTrainingPackHistory,
  type TrainingPackLicenseType,
  type TrainingPackMultiRoundTrend,
} from './trainingPackHistory'

const PROJECT_TITLES: Record<ReplayTrainingProjectId, string> = {
  'reverse-parking': '倒车入库',
  'side-parking': '侧方停车',
  'slope-start': '坡道定点停车和起步',
  'curve-driving': '曲线行驶',
  'right-angle': '直角转弯',
  'subject3': '科目三道路驾驶',
}

const TREND_COPY: Record<TrainingPackTrend, { label: string; detail: string }> = {
  improving: {
    label: '本轮后段更稳定',
    detail: '目标习惯相关错误记录较起始阶段减少。',
  },
  steady: {
    label: '本轮基本持平',
    detail: '目标习惯相关错误记录暂未出现明显下降。',
  },
  'needs-attention': {
    label: '仍需重点巩固',
    detail: '后段仍记录到更多或更严重的目标习惯问题。',
  },
  insufficient: {
    label: '样本不足',
    detail: '至少完成两个阶段后才能观察训练包内的变化趋势。',
  },
}

const MULTI_ROUND_COPY: Record<TrainingPackMultiRoundTrend, { label: string; detail: string }> = {
  improving: {
    label: '较之前改善',
    detail: '最近一轮的严重错误、未完成阶段或目标习惯错误证据较早轮次减少。',
  },
  steady: {
    label: '近期基本持平',
    detail: '最近几轮的关键证据没有出现明显变化。',
  },
  'needs-attention': {
    label: '最近一轮反弹',
    detail: '最近一轮的关键错误证据比当前比较窗口的起点更多。',
  },
  mixed: {
    label: '近期存在波动',
    detail: '有改善也有反弹，还不能判断已经形成稳定习惯。',
  },
  insufficient: {
    label: '再完成一轮即可比较',
    detail: '当前只有一轮完整训练包记录，暂不做跨轮次结论。',
  },
}

function roundDate(createdAt: number) {
  return new Date(createdAt).toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  })
}

function stageResultLabel(stage: TrainingPackStageResult) {
  if (!stage.completed) return '未完成'
  return stage.passed ? '达标' : '需练习'
}

export function TrainingPackReport({
  packId,
  stages,
  candidateName,
  licenseType,
  onRestart,
  onRetryProject,
}: {
  packId: TrainingPackId
  stages: readonly TrainingPackStageResult[]
  candidateName: string
  licenseType: TrainingPackLicenseType
  onRestart: (packId: TrainingPackId) => void
  onRetryProject: (project: ReplayTrainingProjectId) => void
}) {
  const pack = trainingPackById(packId)
  const report = useMemo(
    () => buildTrainingPackReport(packId, stages),
    [packId, stages],
  )
  const trend = TREND_COPY[report.trend]
  const roundHistory = useMemo(
    () => loadTrainingPackHistory({ candidateName, licenseType, packId }),
    [candidateName, licenseType, packId, stages],
  )
  const comparison = useMemo(
    () => compareTrainingPackRounds(roundHistory),
    [roundHistory],
  )
  const multiRound = MULTI_ROUND_COPY[comparison.trend]

  return <section className="training-pack-report" aria-labelledby="training-pack-report-title">
    <div className="training-pack-report-head">
      <div>
        <div className="eyebrow">TRAINING PACK REVIEW</div>
        <h2 id="training-pack-report-title">训练包总复盘</h2>
        <p>{pack.title} · {pack.summary}</p>
      </div>
      <span className={'training-pack-trend ' + report.trend}>
        <strong>{trend.label}</strong>
        <small>{trend.detail}</small>
      </span>
    </div>

    <div className="training-pack-report-metrics">
      <span><b>{report.recordedStages}/{report.totalStages}</b><small>已记录阶段</small></span>
      <span><b>{report.completedStages}</b><small>完整完成</small></span>
      <span><b>{report.passedStages}</b><small>阶段达标</small></span>
      <span><b>{report.habitInfractions}</b><small>目标习惯错误</small></span>
      <span><b>{report.totalFatalInfractions}</b><small>不合格项</small></span>
    </div>

    <div className="training-pack-report-stages">
      {report.stages.map(stage => <article key={stage.packId + '-' + stage.index}>
        <span className="training-pack-stage-index">{stage.index + 1}</span>
        <div>
          <strong>{PROJECT_TITLES[stage.project]}</strong>
          <span>{stageResultLabel(stage)} · {stage.score} 分</span>
        </div>
        <div className="training-pack-stage-evidence">
          <i>相关错误 {stage.habitInfractionCount}</i>
          <i>全部记录 {stage.infractions.length}</i>
          {stage.fatalCount > 0 && <i className="fatal">不合格 {stage.fatalCount}</i>}
        </div>
      </article>)}
    </div>

    <div className="training-pack-report-guidance">
      <b>如何理解这份报告</b>
      <p>不同项目的规则、机会次数和难度并不相同，因此这里比较的是训练包内“目标习惯相关错误记录”的变化，不新增考试分数，也不把跨项目结果当作同一张正式成绩单。</p>
      {report.recommendedRetryProject && <p>
        本轮证据最集中的阶段是 <strong>{PROJECT_TITLES[report.recommendedRetryProject]}</strong>。如果还要继续练，优先回到这个项目，再完整跑一轮训练包确认是否稳定。
      </p>}
    </div>

    <section className="training-pack-history" aria-label="连续训练趋势">
      <div className="training-pack-history-head">
        <div>
          <span>跨轮次改善</span>
          <strong>连续训练趋势</strong>
          <small>仅比较 {candidateName} · {licenseType} · {pack.title} 的最近 {comparison.rounds.length} 轮。</small>
        </div>
        <span className={'training-pack-history-status ' + comparison.trend}>
          <b>{comparison.stableImprovement ? '连续改善' : multiRound.label}</b>
          <small>{comparison.stableImprovement
            ? '最近至少三轮关键错误证据逐轮不增加，并出现实际下降。'
            : multiRound.detail}</small>
        </span>
      </div>

      <div className="training-pack-history-rounds">
        {comparison.rounds.map((round, index) => <article key={round.id}>
          <div className="training-pack-history-round-title">
            <b>第 {index + 1} 轮</b>
            <span>{roundDate(round.createdAt)}</span>
          </div>
          <strong>{round.habitInfractions}</strong>
          <small>目标习惯错误</small>
          <div>
            <i>不合格 {round.totalFatalInfractions}</i>
            <i>完整 {round.completedStages}/{round.totalStages}</i>
          </div>
        </article>)}
      </div>

      {comparison.baseline && comparison.latest && comparison.rounds.length >= 2 && <div className="training-pack-history-delta">
        <span>
          <small>目标习惯错误</small>
          <b>{comparison.baseline.habitInfractions} → {comparison.latest.habitInfractions}</b>
        </span>
        <span>
          <small>不合格项</small>
          <b>{comparison.baseline.totalFatalInfractions} → {comparison.latest.totalFatalInfractions}</b>
        </span>
        <span>
          <small>完整阶段</small>
          <b>{comparison.baseline.completedStages}/{comparison.baseline.totalStages} → {comparison.latest.completedStages}/{comparison.latest.totalStages}</b>
        </span>
      </div>}

      <p className="training-pack-history-note">跨轮次趋势仍然只是训练证据比较：不把不同项目的阶段分数合成为总分，也不会仅凭一次变好就宣称驾驶习惯已经稳定。</p>
    </section>

    <div className="training-pack-report-actions">
      {report.recommendedRetryProject && <button
        type="button"
        className="ghost-btn"
        onClick={() => onRetryProject(report.recommendedRetryProject!)}
      >
        重点回练 · {PROJECT_TITLES[report.recommendedRetryProject]}
      </button>}
      <button
        type="button"
        className="primary"
        onClick={() => onRestart(packId)}
      >
        再练一轮 · {pack.title}
      </button>
    </div>
  </section>
}

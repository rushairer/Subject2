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

function stageResultLabel(stage: TrainingPackStageResult) {
  if (!stage.completed) return '未完成'
  return stage.passed ? '达标' : '需练习'
}

export function TrainingPackReport({
  packId,
  stages,
  onRestart,
  onRetryProject,
}: {
  packId: TrainingPackId
  stages: readonly TrainingPackStageResult[]
  onRestart: (packId: TrainingPackId) => void
  onRetryProject: (project: ReplayTrainingProjectId) => void
}) {
  const pack = trainingPackById(packId)
  const report = useMemo(
    () => buildTrainingPackReport(packId, stages),
    [packId, stages],
  )
  const trend = TREND_COPY[report.trend]

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

import type { TrainingPlan, TrainingPlanItem } from './trainingPlan'
import type { TrainingPackId } from './trainingPacks'

function evidenceText(item: TrainingPlanItem) {
  if (item.roundCount === 0) return ['暂无完整训练包记录']

  const values = [
    `最近 ${item.roundCount} 轮`,
    `目标错误 ${item.latestHabitInfractions ?? 0}`,
    `不合格 ${item.latestFatalInfractions ?? 0}`,
  ]

  if (item.latestCompletedStages != null) {
    values.push(`完整 ${item.latestCompletedStages}/${item.totalStages}`)
  }

  return values
}

export function TrainingPlanPanel({
  plan,
  onStartPack,
}: {
  plan: TrainingPlan
  onStartPack: (packId: TrainingPackId) => void
}) {
  const recommended = plan.recommended

  return <section className="training-plan-section" aria-label="个性化训练建议">
    <div className="section-heading training-plan-heading">
      <div>
        <span className="chapter">LONG-TERM COACHING</span>
        <h2>长期训练建议</h2>
      </div>
      <p>
        基于当前浏览器中同一考生、同一准驾车型的完整训练包记录。
        {plan.totalRounds > 0
          ? ` 本机已有 ${plan.totalRounds} 轮记录；每个训练包取最近最多 5 轮判断趋势。`
          : ' 先建立训练基线，再逐轮调整优先级。'}
      </p>
    </div>

    <article className={'training-plan-feature ' + recommended.state}>
      <div className="training-plan-feature-main">
        <div className="training-plan-kicker">
          <span>当前最值得练</span>
          <b>{recommended.label}</b>
        </div>
        <h3>{recommended.title}</h3>
        <p>{recommended.detail}</p>
        <div className="training-plan-evidence">
          {evidenceText(recommended).map(value => <span key={value}>{value}</span>)}
        </div>
      </div>
      <button
        type="button"
        className="primary"
        onClick={() => onStartPack(recommended.packId)}
      >
        按建议开始 · {recommended.title}
      </button>
    </article>

    <div className="training-plan-status-grid">
      {plan.items.map(item => <article
        key={item.packId}
        className={'training-plan-status-card ' + item.state}
        aria-label={item.title + '训练状态'}
      >
        <div>
          <strong>{item.title}</strong>
          <span>{item.label}</span>
        </div>
        <p>{item.detail}</p>
        <div className="training-plan-evidence compact">
          {evidenceText(item).map(value => <span key={value}>{value}</span>)}
        </div>
      </article>)}
    </div>

    <p className="training-plan-note">
      这里没有额外的“训练能力分”。优先级只来自已经记录的不合格项、未完整阶段、目标习惯错误及其跨轮次变化；“降低优先级”也只表示近期训练证据更稳定，不代表真实道路驾驶能力已经被证明。
    </p>
  </section>
}

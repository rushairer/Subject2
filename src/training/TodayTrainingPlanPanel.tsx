import type { DailyTrainingPlan } from './dailyTrainingPlan'
import type { TrainingPackId } from './trainingPacks'

function taskStateLabel(status: 'pending' | 'completed') {
  return status === 'completed' ? '今日已完成' : '待完成'
}

export function TodayTrainingPlanPanel({
  plan,
  onStartPack,
}: {
  plan: DailyTrainingPlan
  onStartPack: (packId: TrainingPackId) => void
}) {
  return <section className="today-plan-section" aria-label="今日训练计划">
    <div className="section-heading today-plan-heading">
      <div>
        <span className="chapter">TODAY'S PLAN</span>
        <h2>今日训练计划</h2>
      </div>
      <p>每天最多安排两个不同训练包；当天重复刷同一训练包不会替代另一项计划。</p>
    </div>

    <div className="today-plan-progress">
      <span>
        <b>{plan.completedCount}/{plan.totalCount}</b>
        <small>今日完成</small>
      </span>
      <div>
        <strong>{plan.isComplete ? '今日计划已完成' : plan.nextTask ? `下一项 · ${plan.nextTask.title}` : '暂无计划'}</strong>
        <small>
          {plan.isComplete
            ? '今天已经覆盖当前计划中的两个训练方向，下一轮可明天再根据新证据重新排序。'
            : plan.nextTask
              ? `${plan.nextTask.stateLabel} · ${plan.nextTask.summary}`
              : '当前没有可安排的训练任务。'}
        </small>
      </div>
      {plan.nextTask && <button
        type="button"
        className="primary"
        onClick={() => onStartPack(plan.nextTask!.packId)}
      >
        开始今日下一项 · {plan.nextTask.title}
      </button>}
    </div>

    {plan.balanceNotice && <div className="today-plan-balance-note">
      <b>避免训练偏科</b>
      <span>{plan.balanceNotice}</span>
    </div>}

    <div className="today-plan-grid">
      {plan.tasks.map((task, index) => <article
        key={task.packId}
        className={'today-plan-task ' + task.status}
        aria-label={`今日训练第 ${index + 1} 项：${task.title}`}
      >
        <span className="today-plan-index">{index + 1}</span>
        <div>
          <strong>{task.title}</strong>
          <small>{task.summary}</small>
          <div className="today-plan-tags">
            <i>{taskStateLabel(task.status)}</i>
            <i>{task.stateLabel}</i>
            {task.todayRoundCount > 0 && <i>今日 {task.todayRoundCount} 轮</i>}
          </div>
        </div>
        {task.status === 'pending'
          ? <button type="button" onClick={() => onStartPack(task.packId)}>开始</button>
          : <span className="today-plan-done">✓</span>}
      </article>)}
    </div>

    <p className="today-plan-note">
      今日计划只决定训练顺序，不改变长期优先级，也不会因为同一天重复完成一个训练包而把另一类能力挤出计划。
    </p>
  </section>
}
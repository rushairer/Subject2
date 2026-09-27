import type { SessionResultStatus } from './sessionResult'

export type ResultCommentInput = {
  examTitle: string
  score: number
  passLine: number
  status: SessionResultStatus
  resultLabel: string
  infractionTitles: readonly string[]
  fatalCount: number
}

export type ResultComment = {
  badge: string
  headline: string
  detail: string
  shareText: string
}

const PASSED_PERFECT = [
  '满分。教练想挑毛病，只能先挑天气。',
  '100 分，后视镜都想给你鼓掌。',
  '这一把稳到系统怀疑你偷偷背了路线源码。',
] as const

const PASSED_EXCELLENT = [
  '很稳，副驾那只准备拉手刹的手终于放下了。',
  '差一点封神，已经足够让教练少说两句。',
  '车走得很规矩，分数开始有点嚣张。',
] as const

const PASSED_COMFORTABLE = [
  '有惊无险，合格线已经被你稳稳甩在身后。',
  '不算炫技，但属于考官看了愿意点头那种。',
  '今天的关键词：能过，而且不是靠玄学。',
] as const

const PASSED_EDGE = [
  '贴着合格线飞过去，也算飞。',
  '分数不豪华，结果很实用：过了。',
  '合格线：你礼貌吗？',
] as const

const FAILED_FATAL = [
  '今天不是你输，是规则比你先踩了刹车。',
  '考官还没开口，系统先把眉头皱完了。',
  '这一把的优点是：问题暴露得非常诚实。',
] as const

const FAILED_CLOSE = [
  '离合格线只差一脚“稳住”。',
  '分数已经摸到门把手，就差把门推开。',
  '今天车感在线，细节偷偷请假。',
] as const

const FAILED_FAR = [
  '今天先别和方向盘讲感情，回去把基本功聊明白。',
  '这把不是翻车，是给下一把提前交了学费。',
  '系统记得很认真，所以我们也知道下次该练哪儿。',
] as const

const INCOMPLETE = [
  '车还没停稳，故事先按了暂停。',
  '这次不是挂科，是剧情还没播完。',
  '方向盘刚热身，成绩单就先收工了。',
] as const

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pick<T>(items: readonly T[], seed: string) {
  return items[stableHash(seed) % items.length]
}

export function buildResultComment(input: ResultCommentInput): ResultComment {
  const {
    examTitle,
    score,
    passLine,
    status,
    resultLabel,
    infractionTitles,
    fatalCount,
  } = input
  const seed = [examTitle, score, passLine, status, fatalCount, ...infractionTitles].join('|')
  const primaryInfraction = infractionTitles[0]
  const gap = Math.max(0, passLine - score)

  let badge: string
  let headline: string
  let detail: string

  if (status === 'incomplete') {
    badge = '剧情待续'
    headline = pick(INCOMPLETE, seed)
    detail = `${score} 分只是当前已记录的操作。先把全程跑完，再让合格线正式出场。`
  } else if (status === 'failed' && fatalCount > 0) {
    badge = '系统踩刹车'
    headline = pick(FAILED_FATAL, seed)
    detail = primaryInfraction
      ? `主要剧情转折：${primaryInfraction}。好在这里是模拟器，问题暴露得越早越值。`
      : '出现了不合格项目。好在这里是模拟器，问题暴露得越早越值。'
  } else if (status === 'failed') {
    const close = gap <= 10
    badge = close ? '差一点' : '再来一把'
    headline = pick(close ? FAILED_CLOSE : FAILED_FAR, seed)
    detail = gap > 0
      ? `距合格线还差 ${gap} 分。别和分数讲道理，下一把把细节拿回来。`
      : '分数不是主要问题，先把已记录的关键失误处理掉。'
  } else if (score === 100 && infractionTitles.length === 0) {
    badge = '教练静音'
    headline = pick(PASSED_PERFECT, seed)
    detail = '零扣分事件。今天的方向盘和你意见高度一致。'
  } else if (score >= 95) {
    badge = '稳得离谱'
    headline = pick(PASSED_EXCELLENT, seed)
    detail = infractionTitles.length === 0
      ? '全程没有记录到扣分事件，这把可以放心截图。'
      : `${infractionTitles.length} 个扣分点来过，但没有把你从高分区拽下来。`
  } else if (score >= passLine + 5) {
    badge = '稳稳拿下'
    headline = pick(PASSED_COMFORTABLE, seed)
    detail = infractionTitles.length === 0
      ? '没有扣分事件，属于安安静静把事情办成了。'
      : `${infractionTitles.length} 个扣分点已经记账，但没拦住你过线。`
  } else {
    badge = '贴线过关'
    headline = pick(PASSED_EDGE, seed)
    detail = infractionTitles.length === 0
      ? '过线就是过线，先把结果收下，再去追求漂亮。'
      : `${infractionTitles.length} 个扣分点陪你一起过线，下一把争取让它们少来几个。`
  }

  return {
    badge,
    headline,
    detail,
    shareText: `科目二模拟成绩：${score} 分 · ${resultLabel}\n${headline}\n${detail}\n—— ${examTitle}`,
  }
}

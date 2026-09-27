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
  '满分局。方向盘今天主打一个听劝。',
  '这把不是发挥好，是直接把标准答案开出来了。',
  '100 分到手，建议先截图，免得下把不认账。',
  '系统：检测到一名疑似开了熟练度外挂的考生。',
  '这操作丝滑得不像考试，像更新日志里的宣传片。',
  '今天没有扣分点，只有别人的学习资料。',
  '属于是把模拟考试打成了个人秀。',
  '教练本来想点评两句，后来发现只能说“继续保持”。',
  '这把没什么好复盘的，硬要说就是：别飘。',
] as const

const PASSED_EXCELLENT = [
  '很稳，副驾那只准备拉手刹的手终于放下了。',
  '差一点封神，已经足够让教练少说两句。',
  '车走得很规矩，分数开始有点嚣张。',
  '这波属于低调进场，高分离场。',
  '细节偶尔皮一下，大局还是拿捏住了。',
  '不像蒙的，像真会。',
  '已经很接近“考完只想发朋友圈”的分数了。',
  '整体丝滑，偶尔有一帧像网络卡顿。',
  '这把主打一个：瑕不掩瑜，分数先收下。',
  '方向盘很配合，扣分点也没抢到多少镜头。',
  '高分不是偶然，是失误没来得及形成气候。',
  '系统认真找了找，确实只能扣这么点。',
] as const

const PASSED_COMFORTABLE = [
  '有惊无险，合格线已经被你稳稳甩在身后。',
  '不算炫技，但属于考官看了愿意点头那种。',
  '今天的关键词：能过，而且不是靠玄学。',
  '没有神操作，只有稳定输出。',
  '这把不花哨，主打一个实用主义。',
  '分数很务实：不卷满分，只负责过。',
  '过程略有节目效果，结局还是正片。',
  '偶尔让人捏把汗，好在最后没让汗白捏。',
  '不是版本答案，但绝对是可交付版本。',
  '这成绩属于家长看了点头，教练看了暂时不骂。',
  '稳中带点小剧情，但没影响大结局。',
  '没有惊艳全场，但成功避免了惊吓全场。',
] as const

const PASSED_EDGE = [
  '贴着合格线飞过去，也算飞。',
  '分数不豪华，结果很实用：过了。',
  '合格线：你礼貌吗？',
  '极限通关也是通关，别问过程。',
  '这把属于“差一点”和“刚刚好”同时成立。',
  '分数卡得这么准，像提前量过尺寸。',
  '合格线被你蹭了一下，然后你就走了。',
  '别嫌分低，结果栏写的是合格。',
  '这不是险过，这是对合格线的精准拿捏。',
  '考官的眉头刚皱起来，你已经过线了。',
  '主打一个不浪费分：够用就行。',
  '再少一点叫遗憾，现在这个叫技术性过关。',
] as const

const FAILED_FATAL = [
  '今天不是你输，是规则比你先踩了刹车。',
  '考官还没开口，系统先把眉头皱完了。',
  '这一把的优点是：问题暴露得非常诚实。',
  '剧情发展很快，系统下判决更快。',
  '这波不是扣分，是直接触发了大结局。',
  '分数还想努力一下，规则说不用了。',
  '操作可能还能解释，规则表示不听解释。',
  '本来还能抢救，结果一脚踩进了终局剧情。',
  '系统：这个失误我得认真记一笔。',
  '今天的反派不是教练，是那条致命规则。',
  '高开低走不可怕，可怕的是系统直接关服。',
  '这一把很有教育意义，尤其是对下一把。',
] as const

const FAILED_CLOSE = [
  '离合格线只差一脚“稳住”。',
  '分数已经摸到门把手，就差把门推开。',
  '今天车感在线，细节偷偷请假。',
  '这波就差一点点，属于看回放会拍大腿的程度。',
  '合格线就在眼前，你俩差个正式认识。',
  '不是不会，是关键时刻手感掉了个包。',
  '大方向没毛病，小细节开始搞事情。',
  '已经打到 Boss 残血，自己先交了技能。',
  '这成绩最气人的地方：你明明快过了。',
  '差距不大，遗憾挺会放大。',
  '离过关只差一点，离“我早知道”只差一秒。',
  '这把的问题不是不会，是太会制造悬念。',
] as const

const FAILED_FAR = [
  '今天先别和方向盘讲感情，回去把基本功聊明白。',
  '这把不是翻车，是给下一把提前交了学费。',
  '系统记得很认真，所以我们也知道下次该练哪儿。',
  '这波操作有点超前，车还没学会配合。',
  '今天先不谈封神，先把基础补丁打上。',
  '分数很诚实：该练的地方一个没藏。',
  '方向盘可能有自己的想法，建议下把统一一下思想。',
  '这把节目效果拉满，考试效果稍欠。',
  '别急着删回放，它现在是最值钱的教材。',
  '目前属于“潜力很大，兑现较少”。',
  '不是没路走，是这把走得有点自由。',
  '先别追求丝滑，先把“能稳定跑完”这个 Buff 叠起来。',
] as const

const INCOMPLETE = [
  '车还没停稳，故事先按了暂停。',
  '这次不是挂科，是剧情还没播完。',
  '方向盘刚热身，成绩单就先收工了。',
  '这把还没到结局，先别急着给自己打分。',
  '系统只看到上半场，下半场记得补播。',
  '属于是预告片拍完了，正片还没上映。',
  '进度条没走完，先不让合格线背锅。',
  '这成绩像下载到 73% 的文件：现在下结论太早。',
  '车还想继续，成绩页说先来个中场休息。',
  '本局未完待续，别让这个分数提前剧透。',
] as const

const PERFECT_BADGES = ['教练静音', '满分战神', '系统认证', '丝滑通关'] as const
const EXCELLENT_BADGES = ['稳得离谱', '高分在线', '拿捏住了', '状态火热'] as const
const COMFORTABLE_BADGES = ['稳稳拿下', '可交付版本', '顺利过线', '大局已定'] as const
const EDGE_BADGES = ['贴线过关', '极限通关', '精准过线', '够用就行'] as const
const FATAL_BADGES = ['系统踩刹车', '剧情急转弯', '规则出手', '大结局提前'] as const
const CLOSE_BADGES = ['差一点', '就差临门一脚', 'Boss 残血', '遗憾局'] as const
const FAR_BADGES = ['再来一把', '先打基础', '回炉升级', '补丁时间'] as const
const INCOMPLETE_BADGES = ['剧情待续', '未完待续', '进度未满', '中场暂停'] as const

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

function infractionRoast(title: string) {
  if (/压线|出线|越线/.test(title)) return '线就在那里，你也在那里，缘分确实有点过头。'
  if (/熄火/.test(title)) return '发动机先下班了，留下你和成绩单面面相觑。'
  if (/溜车|后溜|后退/.test(title)) return '重力今天存在感很强，坡道也没打算客气。'
  if (/安全带/.test(title)) return '人还没开始秀操作，安全感先掉线了。'
  if (/转向灯|灯光|远光|近光/.test(title)) return '灯没跟上剧情，属于演员到场了，道具还在路上。'
  if (/超时|时间/.test(title)) return '路线还没急，计时器先替你急了。'
  if (/超速|速度/.test(title)) return '车速上去了，分数下来的速度也没闲着。'
  if (/停车|中途停车/.test(title)) return '车很有自己的节奏，说停就停，完全不看剧本。'
  if (/倒车入库|入库/.test(title)) return '车库很大，但你和它的关系还需要再磨合一下。'
  if (/侧方/.test(title)) return '侧方位今天有点高冷，没那么容易让你停进去。'
  if (/曲线|S弯/.test(title)) return '弯道没为难你太久，主要是你们彼此不太熟。'
  if (/直角/.test(title)) return '直角很直，路线很明确，剧情却拐得有点突然。'
  if (/坡|起步/.test(title)) return '坡道起步这关，车和脚下配合还差一点默契。'
  if (/方向|转向/.test(title)) return '方向盘这次有点自己的想法，下把记得开个会。'
  return '这个失误不一定致命，但很会抢镜。'
}

function buildDetail({
  status,
  score,
  passLine,
  infractionTitles,
  fatalCount,
}: Pick<ResultCommentInput, 'status' | 'score' | 'passLine' | 'infractionTitles' | 'fatalCount'>) {
  const primaryInfraction = infractionTitles[0]
  const gap = Math.max(0, passLine - score)

  if (status === 'incomplete') {
    return `${score} 分只是当前已记录的操作。先把全程跑完，再让合格线正式出场。`
  }

  if (status === 'failed' && fatalCount > 0) {
    return primaryInfraction
      ? `主要剧情转折：${primaryInfraction}。 ${infractionRoast(primaryInfraction)}`
      : '出现了不合格项目。好在这里是模拟器，问题暴露得越早越值。'
  }

  if (status === 'failed') {
    if (primaryInfraction) {
      return `距合格线还差 ${gap} 分。主要失误：${primaryInfraction}。 ${infractionRoast(primaryInfraction)}`
    }
    return gap > 0
      ? `距合格线还差 ${gap} 分。别和分数讲道理，下一把把细节拿回来。`
      : '分数不是主要问题，先把已记录的关键失误处理掉。'
  }

  if (score === 100 && infractionTitles.length === 0) {
    return '零扣分事件。今天的方向盘和你意见高度一致。'
  }

  if (infractionTitles.length === 0) {
    return score >= 95
      ? '全程没有记录到扣分事件，这把可以放心截图。'
      : '没有扣分事件，属于安安静静把事情办成了。'
  }

  const roast = infractionRoast(primaryInfraction)
  if (score >= 95) {
    return `${infractionTitles.length} 个扣分点来过，但没有把你从高分区拽下来。代表作：${primaryInfraction}。 ${roast}`
  }
  if (score >= passLine + 5) {
    return `${infractionTitles.length} 个扣分点已经记账，但没拦住你过线。代表作：${primaryInfraction}。 ${roast}`
  }
  return `${infractionTitles.length} 个扣分点陪你一起过线。代表作：${primaryInfraction}。 ${roast}`
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
  const gap = Math.max(0, passLine - score)

  let badge: string
  let headline: string

  if (status === 'incomplete') {
    badge = pick(INCOMPLETE_BADGES, seed + '|badge')
    headline = pick(INCOMPLETE, seed)
  } else if (status === 'failed' && fatalCount > 0) {
    badge = pick(FATAL_BADGES, seed + '|badge')
    headline = pick(FAILED_FATAL, seed)
  } else if (status === 'failed') {
    const close = gap <= 10
    badge = pick(close ? CLOSE_BADGES : FAR_BADGES, seed + '|badge')
    headline = pick(close ? FAILED_CLOSE : FAILED_FAR, seed)
  } else if (score === 100 && infractionTitles.length === 0) {
    badge = pick(PERFECT_BADGES, seed + '|badge')
    headline = pick(PASSED_PERFECT, seed)
  } else if (score >= 95) {
    badge = pick(EXCELLENT_BADGES, seed + '|badge')
    headline = pick(PASSED_EXCELLENT, seed)
  } else if (score >= passLine + 5) {
    badge = pick(COMFORTABLE_BADGES, seed + '|badge')
    headline = pick(PASSED_COMFORTABLE, seed)
  } else {
    badge = pick(EDGE_BADGES, seed + '|badge')
    headline = pick(PASSED_EDGE, seed)
  }

  const detail = buildDetail({ status, score, passLine, infractionTitles, fatalCount })

  return {
    badge,
    headline,
    detail,
    shareText: `科目二模拟成绩：${score} 分 · ${resultLabel}\n${headline}\n${detail}\n—— ${examTitle}`,
  }
}

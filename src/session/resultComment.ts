import type { SessionResultStatus } from './sessionResult'
import type { CollisionObjectRole, DrivingIncident } from './drivingIncident'

export type ResultCommentInput = {
  examTitle: string
  score: number
  passLine: number
  status: SessionResultStatus
  resultLabel: string
  infractionTitles: readonly string[]
  incidentTitles?: readonly string[]
  incidents?: readonly Pick<DrivingIncident, 'title' | 'category' | 'collision'>[]
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

type RoastRule = {
  pattern: RegExp
  lines: readonly string[]
}

const INFRACTION_ROAST_RULES: readonly RoastRule[] = [
  {
    pattern: /锥桶|雪糕桶|路锥|锥形桶/,
    lines: [
      '锥桶：我就站这儿上个班，怎么还算工伤了。',
      '全场最无辜的是那个锥桶，它甚至没有驾照。',
      '雪糕桶的工作是站着，不是陪你做碰撞测试。',
      '绕开它本来是选择题，你硬是做成了接触题。',
      '教练让你看点位，没让你去和锥桶线下见面。',
      '这个桶颜色已经够显眼了，再撞就属于主动社交。',
      '锥桶没有闪现技能，下次只能麻烦你自己绕。',
      '别人绕桩，你这是直接和桩建立合作关系。',
      '锥桶都穿成荧光橙了，还没躲过你的精准打击。',
      '今天点位没找准，桶倒是找得挺准。',
      '这么大一片路，偏偏和最小的那个障碍物有缘。',
      '锥桶本来负责提醒你别靠近，现在改负责实战教学。',
      '教练让你绕过去，你用实际行动证明了什么叫不走寻常路。',
    ],
  },
  {
    pattern: /树木|撞树|树/,
    lines: [
      '树站那儿这么多年，今天终于等到你来打招呼。',
      '方向盘：我以为要绕过去。你：不，我们去认识一下。',
      '树不会横穿马路，所以这次很难让它背锅。',
      '绿化做得挺好，就是不建议用车头近距离验收。',
      '教练说看远一点，你直接把视线落在树干上了。',
      '这棵树唯一的操作，就是没动。',
      '树：我根都扎这儿了，你还能说是我突然出现？',
      '下次记住，科目考试不包含“车辆与自然亲密接触”。',
      '树都不会动，你还能和它会师，路线选择确实很有主见。',
      '这么宽的路，最后和树达成了双向奔赴。',
      '树没考驾照，但今天被迫参加了你的考试。',
      '导航说沿路行驶，你理解成了沿树行驶。',
      '教练看到这一幕，只想问一句：那棵树到底哪里吸引你？',
    ],
  },
  {
    pattern: /建筑|墙|围墙|房/,
    lines: [
      '建筑物没有突然横穿马路的习惯，这锅它不接。',
      '墙一直很稳定，今天不稳定的是你和方向盘的关系。',
      '路线这么宽，你偏偏去研究建筑材料。',
      '这是驾驶考试，不是建筑质量抽检。',
      '再靠近一点，物业都要出来问你找谁了。',
      '教练让你靠边，没让你靠墙。',
    ],
  },
  {
    pattern: /立杆|灯杆|标志杆|桩杆|杆/,
    lines: [
      '杆子确实细，但也不是让你验证碰撞箱的。',
      '这么细一根杆你都能精准命中，准头值得用在别处。',
      '教练说盯点，不是盯着杆子开过去。',
      '这根杆今天什么都没做，就完成了一次被动教学。',
      '避障没避开，倒是把精准度证明了。',
      '杆：谢谢关注，下次远观就行。',
    ],
  },
  {
    pattern: /与车辆发生碰撞|碰撞.*车辆|撞车|车辆碰撞/,
    lines: [
      '别人是交通参与者，不是移动靶。',
      '跟车不是跟到一起，保持距离这四个字得拆开重学。',
      '两辆车本来各走各的，你非要安排一次会师。',
      '保险公司看了这段回放，可能比教练更紧张。',
      '这不是并线，是把两个车道的故事强行合并了。',
      '道路社交可以有，车身接触就免了。',
    ],
  },
  {
    pattern: /行人.*碰撞|碰撞.*行人|撞.*行人/,
    lines: [
      '看到行人先收油收心，别把模拟器开成反应测试。',
      '行人不是路线上的障碍物，优先级比你的成绩高。',
      '这时候该踩的是刹车，不是剧情加速键。',
      '教练看到这里已经不毒舌了，只想让你先把刹车认熟。',
      '路权判断可以慢半拍，刹车不能慢半拍。',
    ],
  },
  {
    pattern: /电动车.*碰撞|碰撞.*电动车|撞.*电动车|摩托车.*碰撞/,
    lines: [
      '电动车不是保龄球瓶，别拿车头找击中感。',
      '道路上车型很多，不代表都要逐一近距离体验。',
      '这波不是会车，是强行认识。',
      '看到两轮车先留空间，别把安全距离压缩成社交距离。',
      '教练让你观察交通，不是收集碰撞图鉴。',
    ],
  },
  {
    pattern: /安全带/,
    lines: [
      '安全带就在肩膀旁边，你选择和它保持社交距离。',
      '车还没开明白，安全带先被你冷落明白了。',
      '这题没有技术含量，唯一要求就是记得伸手。',
      '安全带：我功能都写名字上了，你还是没用我。',
      '方向盘可以慢慢学，安全带真不用练到第二把。',
      '教练最怕这种扣分：不是不会，是压根忘了。',
      '人都坐进驾驶位了，安全意识还在候车区。',
      '这一分丢得很纯粹——没有操作难度，只有遗忘难度。',
      '系安全带只要两秒，你用一整张成绩单记住了它。',
      '先别研究走线，先把自己固定在线内。',
      '这本来是送分题，你成功把分送回去了。',
      '安全带不会考点位，不会考半联动，只考记性——结果记性先熄火了。',
      '驾考里最便宜的保险，你选择暂时不用。',
      '忘系安全带这种失误，连教练的毒舌都显得多余：扣分理由已经够毒了。',
      '上车第一件事没做，后面的技术展示多少有点抢跑。',
    ],
  },
  {
    pattern: /熄火|发动机停止/,
    lines: [
      '发动机先下班了，留下你和成绩单面面相觑。',
      '车：今天先练到这儿。你：我还没同意呢。',
      '油离配合还没谈拢，发动机选择退出群聊。',
      '这把最果断的是发动机，说熄就熄。',
      '教练还没喊停，发动机先替教练执行了。',
      '脚下稍微温柔一点，发动机不是开关题。',
      '半联动没找到，倒是精准找到了熄火点。',
    ],
  },
  {
    pattern: /溜车|后溜|倒溜|后退/,
    lines: [
      '重力今天存在感很强，坡道也没打算客气。',
      '别人坡起向前，你先给历史倒了个带。',
      '车没想回家，是你的脚让它产生了这个念头。',
      '坡道：我只负责有坡，往哪儿走是你的事。',
      '前进挡的目标很明确，车辆的实际行动略有不同。',
      '这把不是起步，是先撤退再说。',
      '教练让你松手刹，不是放弃抵抗。',
    ],
  },
  {
    pattern: /压线|出线|越线|触线|轧线|车身出/,
    lines: [
      '线就在那里，你也在那里，缘分确实有点过头。',
      '考试线不是磁吸充电器，不用贴那么近。',
      '别人看点位，你在和边线培养感情。',
      '这条线存在的意义，就是提醒你别压；你选择亲自验证。',
      '车轮和边线成功会师，成绩顺便表示遗憾。',
      '线没动，车动了，所以责任划分比较清晰。',
      '能把线压得这么准，说明精准度不是没有，只是用错地方。',
      '离线远一点不会扣分，真的不用贴脸输出。',
    ],
  },
  {
    pattern: /转向灯|方向灯/,
    lines: [
      '转向灯最大的作用不是装饰，是提前告诉别人你要干什么。',
      '车都准备转了，灯还在思考人生。',
      '动作已经发生，信号还没发出去，这叫先斩后奏。',
      '转向灯不是考试彩蛋，想起来再点没有加成。',
      '方向盘已经表态了，转向灯还保持中立。',
      '教练最怕你这种：心里知道往哪儿转，就是不告诉别人。',
    ],
  },
  {
    pattern: /远光|近光|灯光|照明/,
    lines: [
      '灯光不是氛围组，什么时候开什么得讲规矩。',
      '这不是舞台灯控，远近光不用靠感觉切。',
      '车灯很亮，规则记忆稍微有点暗。',
      '灯开得挺积极，时机选得比较有个人风格。',
      '夜间驾驶不是谁亮谁有理。',
      '灯光操作没跟上路况，属于设备在线、判断离线。',
    ],
  },
  {
    pattern: /超速|超过.*速度|速度过高/,
    lines: [
      '车速上去了，分数下来的速度也没闲着。',
      '这是驾考模拟，不是排位赛。',
      '油门很有事业心，可惜考试不看圈速。',
      '你负责提速，系统负责提醒你冷静。',
      '开得快不等于开得好，尤其成绩单已经举证。',
      '教练还没来得及说慢点，系统先把分扣了。',
      '油门踩得像后面有外卖要凉了，可这是考试，不是配送。',
      '限速牌负责提醒，你负责当没看见，系统负责结算。',
    ],
  },
  {
    pattern: /未按.*减速|合理减速|减速/,
    lines: [
      '该慢的时候没慢，属于把“提前量”全留给了后悔。',
      '刹车不是最后一秒的剧情反转工具。',
      '路况已经暗示得很明显了，你选择保持原节奏。',
      '教练嘴里的“慢一点”不是背景音乐。',
      '速度控制这块，油门的发言权暂时有点大。',
    ],
  },
  {
    pattern: /超时|超过.*秒|时间/,
    lines: [
      '路线还没急，计时器先替你急了。',
      '动作可以稳，不能稳到系统开始催更。',
      '考试不是无限时副本，计时器是真的会结算。',
      '你在精雕细琢，倒计时只想按时下班。',
      '教练允许你想一下，系统没允许你想这么久。',
      '这把最大的问题不是不会，是流程进入了慢放模式。',
    ],
  },
  {
    pattern: /未完整观察|未完成.*观察|未观察|观察.*不足/,
    lines: [
      '镜子不是内饰，路口也不是开盲盒。',
      '车往前走了，观察流程还停在上一页。',
      '教练让你左右看，不是做颈椎操，是怕真有东西。',
      '这波属于勇气有余，信息收集不足。',
      '路况没看全就开始操作，多少有点凭感觉开副本。',
      '先看再动四个字，今天执行成了先动再说。',
      '后视镜不是付费 DLC，装了就得用。',
      '别人开车靠观察，你这段更像靠信念。',
    ],
  },
  {
    pattern: /驻车制动|手刹/,
    lines: [
      '手刹还在上班，你已经准备带着它一起出发了。',
      '车想走，手刹想留，内部意见完全没统一。',
      '起步前少开了一个会：问问手刹同不同意。',
      '油门负责前进，手刹负责反对，你负责夹在中间。',
      '教练听发动机声音就知道：有人忘了松手刹。',
    ],
  },
  {
    pattern: /挡位|档位|换挡|加挡|减挡|挂挡/,
    lines: [
      '挡位不是抽卡，得按车速和场景来。',
      '发动机转速已经给提示了，你和挡把还没达成共识。',
      '这波换挡有想法，就是和车况不太熟。',
      '挡位选得比较自由，车辆反馈得比较诚实。',
      '教练看你摸挡把的样子，就知道下一秒有剧情。',
    ],
  },
  {
    pattern: /倒车入库|入库/,
    lines: [
      '车库很大，但你和它的关系还需要再磨合一下。',
      '库位不会跑，慢一点它还是在那里。',
      '倒库不是俄罗斯方块，塞进去不算，姿势也得对。',
      '后视镜已经尽力了，剩下的得方向盘配合。',
      '库角都看见了，路线还是走出了自己的理解。',
    ],
  },
  {
    pattern: /侧方/,
    lines: [
      '侧方位今天有点高冷，没那么容易让你停进去。',
      '车位就在旁边，你们今天主打一个擦肩而过。',
      '侧方停车不要求一见钟情，但至少得停进去。',
      '点位都认识，组合起来还有点陌生。',
      '教练看完表示：步骤都有，合成效果待优化。',
    ],
  },
  {
    pattern: /曲线|S弯/,
    lines: [
      '弯道没为难你太久，主要是你们彼此不太熟。',
      'S 弯不是让你写草书，轨迹不用这么自由。',
      '弯道很有规律，你的路线更有创意。',
      '方向盘打得挺忙，车身未必完全理解。',
      '教练说顺着弯走，你给弯道重新设计了一版。',
    ],
  },
  {
    pattern: /直角/,
    lines: [
      '直角很直，路线很明确，剧情却拐得有点突然。',
      '这个弯只有九十度，你开出了更多可能性。',
      '点位到了再打方向，不是方向到了再找点位。',
      '直角转弯本来线条很硬，你的路线更抽象。',
      '教练说一把过，你理解成了一把方向打到底。',
    ],
  },
  {
    pattern: /坡|起步/,
    lines: [
      '坡道起步这关，车和脚下配合还差一点默契。',
      '坡不背锅，它每一把都长这样。',
      '油门、离合、刹车三方会议今天没开成功。',
      '坡道没有针对你，它对每个人都一样斜。',
      '教练最熟悉的表情，往往就出现在坡起这一段。',
    ],
  },
  {
    pattern: /中途停车|不应停车|停车/,
    lines: [
      '车很有自己的节奏，说停就停，完全不看剧本。',
      '这里不是服务区，临时休息不计入考试流程。',
      '路线还没结束，你先给自己插了段广告。',
      '该连续的时候停下来，属于主动给难度加码。',
      '教练没喊停，车先进入了思考模式。',
    ],
  },
  {
    pattern: /方向|转向|路线/,
    lines: [
      '方向盘这次有点自己的想法，下把记得开个会。',
      '路线是固定的，你开出了自定义皮肤。',
      '导航没让你自由发挥，方向盘倒是挺支持。',
      '车头去哪儿这件事，最好由你提前决定。',
      '教练看得出来你有方向，只是方向比较多。',
    ],
  },
]

type ContextHeadlineRule = {
  pattern: RegExp
  badges: readonly string[]
  lines: readonly string[]
}

const CONTEXT_HEADLINE_RULES: readonly ContextHeadlineRule[] = [
  {
    pattern: /行人.*碰撞|碰撞.*行人|撞.*行人/,
    badges: ['刹车必修课', '安全第一', '先把刹车认熟'],
    lines: [
      '这段先别秀技术，刹车得比剧情反转更快。',
      '行人不是考试道具，这一题只能用安全意识答。',
      '成绩可以重来，遇到行人先把车稳稳停下来。',
    ],
  },
  {
    pattern: /与车辆发生碰撞|碰撞.*车辆|撞车|车辆碰撞/,
    badges: ['强行会师', '距离归零', '保险公司预警'],
    lines: [
      '跟车不是跟到一起，你把“保持距离”做成了反义词。',
      '两辆车各走各的，你硬是安排了一场会师。',
      '这段回放最大的观众，可能是保险公司。',
      '道路社交可以有，车身握手就免了。',
    ],
  },
  {
    pattern: /电动车.*碰撞|碰撞.*电动车|撞.*电动车|摩托车.*碰撞/,
    badges: ['强行认识', '安全距离失踪', '碰撞图鉴 +1'],
    lines: [
      '两轮车不是收集品，不用靠车头解锁图鉴。',
      '安全距离被你压缩成了社交距离。',
      '这不是会车，是强行认识。',
    ],
  },
  {
    pattern: /树木|撞树|树/,
    badges: ['绿化亲密接触', '树：我没动', '路线过于自然'],
    lines: [
      '树没动，你动了；责任划分相当清晰。',
      '路这么宽，最后还是和树双向奔赴。',
      '树都不会横穿马路，这次确实很难让它背锅。',
      '绿化验收通过，驾驶路线需要复审。',
    ],
  },
  {
    pattern: /锥桶|雪糕桶|路锥|锥形桶/,
    badges: ['精准命中', '锥桶受害者协会', '点位很特别', '现场有桶'],
    lines: [
      '点位没找准，雪糕桶倒是找得挺准。',
      '100 分归 100 分，锥桶有不同意见。',
      '别人绕桩，你负责和桩建立联系。',
      '锥桶都穿荧光橙了，还是没躲过你的精准打击。',
      '这不是绕桩，是线下见面。',
    ],
  },
  {
    pattern: /建筑|墙|围墙|房/,
    badges: ['建筑质检员', '靠边过头', '物业预警'],
    lines: [
      '这是驾驶考试，不是建筑质量抽检。',
      '教练让你靠边，没让你靠墙。',
      '建筑一直没动，今天路线倒挺有想法。',
    ],
  },
  {
    pattern: /立杆|灯杆|标志杆|桩杆|入口立杆/,
    badges: ['准头用错地方', '杆：谢谢关注', '精准碰杆'],
    lines: [
      '这么细一根杆都能精准命中，准头值得用在别处。',
      '教练说盯点，不是盯着杆子开过去。',
      '杆子没挡路，你主动去找它了。',
    ],
  },
  {
    pattern: /安全带/,
    badges: ['送分题送回去', '记性掉线', '安全带被冷落'],
    lines: [
      '这题只考记性，你选择展示忘性。',
      '安全带只要两秒，你用一整张成绩单记住了它。',
      '上车第一件事没做，后面的技术展示多少有点抢跑。',
      '方向盘可以慢慢学，安全带真不用练到第二把。',
    ],
  },
  {
    pattern: /熄火|发动机停止/,
    badges: ['发动机先退考', '动力已下班', '半联动失联'],
    lines: [
      '教练没喊停，发动机先交卷了。',
      '半联动没找到，倒是精准找到了熄火点。',
      '油离配合还没谈拢，发动机先退出群聊。',
    ],
  },
  {
    pattern: /溜车|后溜|倒溜|后退/,
    badges: ['向前考试 向后发挥', '重力胜出', '先撤退再说'],
    lines: [
      '考试要求向前，你先给历史倒了个带。',
      '车没想回家，是你的脚让它产生了这个念头。',
      '坡道只负责斜，往哪儿走还得你负责。',
    ],
  },
  {
    pattern: /压线|出线|越线|触线|轧线|车身出/,
    badges: ['边线磁吸', '贴脸输出', '精准压线'],
    lines: [
      '考试线不是磁吸充电器，真不用贴这么近。',
      '线没动，车动了，所以责任划分也挺清楚。',
      '精准度是有的，只是全用在压线上了。',
    ],
  },
  {
    pattern: /超速|超过.*速度|速度过高/,
    badges: ['不是排位赛', '油门事业心强', '圈速无效'],
    lines: [
      '这是驾考模拟，不是排位赛。',
      '油门很有事业心，可惜考试不看圈速。',
      '车速上去了，分数下来的速度也没闲着。',
    ],
  },
  {
    pattern: /未完整观察|未完成.*观察|未观察|观察.*不足/,
    badges: ['后视镜非 DLC', '靠信念驾驶', '信息收集失败'],
    lines: [
      '后视镜不是付费 DLC，装了就得用。',
      '别人开车靠观察，你这段更像靠信念。',
      '先看再动四个字，今天执行成了先动再说。',
    ],
  },
  {
    pattern: /转向灯|方向灯/,
    badges: ['先斩后奏', '灯还没表态', '信号掉线'],
    lines: [
      '方向盘已经表态了，转向灯还保持中立。',
      '动作都发生了，信号还没发出去，这叫先斩后奏。',
      '心里知道往哪儿转，不代表别人也知道。',
    ],
  },
  {
    pattern: /远光|近光|灯光|照明/,
    badges: ['灯亮规则暗', '灯光氛围组', '时机很个性'],
    lines: [
      '车灯很亮，规则记忆稍微有点暗。',
      '灯光不是氛围组，什么时候开什么得讲规矩。',
      '设备在线，判断暂时离线。',
    ],
  },
  {
    pattern: /驻车制动|手刹/,
    badges: ['内部意见不统一', '手刹拒绝出发', '前进受阻'],
    lines: [
      '车想走，手刹想留，内部意见完全没统一。',
      '油门负责前进，手刹负责反对，你负责夹在中间。',
      '起步前少开了一个会：问问手刹同不同意。',
    ],
  },
]

function contextualHeadline(titles: readonly string[], seed: string) {
  for (const rule of CONTEXT_HEADLINE_RULES) {
    const title = titles.find(candidate => rule.pattern.test(candidate))
    if (!title) continue
    return {
      title,
      badge: pick(rule.badges, seed + '|context-badge|' + title),
      headline: pick(rule.lines, seed + '|context-headline|' + title),
    }
  }
  return null
}

type CollisionCoachCopy = {
  badges: readonly string[]
  headlines: readonly string[]
  roasts: readonly string[]
}

const POLE_COACH_COPY: CollisionCoachCopy = {
  badges: ['准头用错地方', '杆：谢谢关注', '精准碰杆'],
  headlines: [
    '这么细一根杆都能精准命中，准头值得用在别处。',
    '教练说盯点，不是盯着杆子开过去。',
    '杆子没挡路，你主动去找它了。',
  ],
  roasts: [
    '杆子确实细，但也不是让你验证碰撞箱的。',
    '这根杆今天什么都没做，就完成了一次被动教学。',
    '避障没避开，倒是把精准度证明了。',
    '杆：谢谢关注，下次远观就行。',
  ],
}

const COLLISION_COACH_COPY: Partial<Record<CollisionObjectRole, CollisionCoachCopy>> = {
  'traffic-cone': {
    badges: ['精准命中', '锥桶受害者协会', '点位很特别', '现场有桶'],
    headlines: [
      '点位没找准，雪糕桶倒是找得挺准。',
      '100 分归 100 分，锥桶有不同意见。',
      '别人绕桩，你负责和桩建立联系。',
      '锥桶都穿荧光橙了，还是没躲过你的精准打击。',
      '这不是绕桩，是线下见面。',
    ],
    roasts: [
      '锥桶：我就站这儿上个班，怎么还算工伤了。',
      '雪糕桶的工作是站着，不是陪你做碰撞测试。',
      '绕开它本来是选择题，你硬是做成了接触题。',
      '教练让你看点位，没让你去和锥桶线下见面。',
      '这么大一片路，偏偏和最小的那个障碍物有缘。',
    ],
  },
  'sign-post': POLE_COACH_COPY,
  'course-gate-post': POLE_COACH_COPY,
  pole: POLE_COACH_COPY,
  tree: {
    badges: ['绿化亲密接触', '树：我没动', '路线过于自然'],
    headlines: [
      '树没动，你动了；责任划分相当清晰。',
      '路这么宽，最后还是和树双向奔赴。',
      '树都不会横穿马路，这次确实很难让它背锅。',
      '绿化验收通过，驾驶路线需要复审。',
    ],
    roasts: [
      '树站那儿这么多年，今天终于等到你来打招呼。',
      '绿化做得挺好，就是不建议用车头近距离验收。',
      '这棵树唯一的操作，就是没动。',
      '树没考驾照，但今天被迫参加了你的考试。',
    ],
  },
  building: {
    badges: ['建筑质检员', '靠边过头', '物业预警'],
    headlines: [
      '这是驾驶考试，不是建筑质量抽检。',
      '教练让你靠边，没让你靠墙。',
      '建筑一直没动，今天路线倒挺有想法。',
    ],
    roasts: [
      '建筑物没有突然横穿马路的习惯，这锅它不接。',
      '路线这么宽，你偏偏去研究建筑材料。',
      '再靠近一点，物业都要出来问你找谁了。',
    ],
  },
  vehicle: {
    badges: ['强行会师', '距离归零', '保险公司预警'],
    headlines: [
      '跟车不是跟到一起，你把“保持距离”做成了反义词。',
      '两辆车各走各的，你硬是安排了一场会师。',
      '道路社交可以有，车身握手就免了。',
    ],
    roasts: [
      '别人是交通参与者，不是移动靶。',
      '保险公司看了这段回放，可能比教练更紧张。',
      '这不是并线，是把两个车道的故事强行合并了。',
    ],
  },
  pedestrian: {
    badges: ['刹车必修课', '安全第一', '先把刹车认熟'],
    headlines: [
      '这段先别秀技术，刹车得比剧情反转更快。',
      '行人不是考试道具，这一题只能用安全意识答。',
      '成绩可以重来，遇到行人先把车稳稳停下来。',
    ],
    roasts: [
      '看到行人先收油收心，别把模拟器开成反应测试。',
      '这时候该踩的是刹车，不是剧情加速键。',
      '路权判断可以慢半拍，刹车不能慢半拍。',
    ],
  },
  scooter: {
    badges: ['强行认识', '安全距离失踪', '碰撞图鉴 +1'],
    headlines: [
      '两轮车不是收集品，不用靠车头解锁图鉴。',
      '安全距离被你压缩成了社交距离。',
      '这不是会车，是强行认识。',
    ],
    roasts: [
      '电动车不是保龄球瓶，别拿车头找击中感。',
      '道路上车型很多，不代表都要逐一近距离体验。',
      '教练让你观察交通，不是收集碰撞图鉴。',
    ],
  },
}

function contextualIncidentHeadline(
  incidents: readonly Pick<DrivingIncident, 'title' | 'collision'>[],
  seed: string,
) {
  const priority: readonly CollisionObjectRole[] = [
    'pedestrian', 'vehicle', 'scooter', 'tree', 'building',
    'sign-post', 'course-gate-post', 'pole', 'traffic-cone',
  ]
  for (const object of priority) {
    const incident = incidents.find(item => item.collision.object === object)
    const copy = COLLISION_COACH_COPY[object]
    if (!incident || !copy) continue
    return {
      title: incident.title,
      badge: pick(copy.badges, seed + '|incident-badge|' + object),
      headline: pick(copy.headlines, seed + '|incident-headline|' + object),
    }
  }
  return null
}

function collisionIncidentRoast(
  incident: Pick<DrivingIncident, 'title' | 'collision'>,
  seed: string,
) {
  const copy = COLLISION_COACH_COPY[incident.collision.object]
  return copy
    ? pick(copy.roasts, seed + '|incident-roast|' + incident.collision.object)
    : infractionRoast(incident.title, seed)
}

const DEFAULT_INFRACTION_ROASTS = [
  '这个失误不一定致命，但很会抢镜。',
  '教练看完没说话，先把回放往前拖了五秒。',
  '这一项操作很有个人风格，可惜评分标准不吃这一套。',
  '系统没有情绪，所以它只是安静地把分扣了。',
  '这一下属于练车时很有价值，考试时最好别再见。',
  '复盘建议很简单：这段再看一遍，然后假装没发生过。',
] as const

function infractionRoast(title: string, seed = title) {
  const matched = INFRACTION_ROAST_RULES.find(rule => rule.pattern.test(title))
  return pick(matched?.lines ?? DEFAULT_INFRACTION_ROASTS, seed + '|infraction-roast|' + title)
}

function buildDetail({
  status,
  score,
  passLine,
  infractionTitles,
  incidentTitles = [],
  incidents = [],
  fatalCount,
}: Pick<ResultCommentInput, 'status' | 'score' | 'passLine' | 'infractionTitles' | 'incidentTitles' | 'incidents' | 'fatalCount'>) {
  const highlightedInfraction = contextualHeadline(infractionTitles, [status, score, passLine, 'detail'].join('|'))
  const primaryInfraction = highlightedInfraction?.title ?? infractionTitles[0]
  const effectiveIncidentTitles = incidents.length > 0 ? incidents.map(item => item.title) : incidentTitles
  const primaryTypedIncident = incidents[0]
  const primaryIncidentTitle = primaryTypedIncident?.title ?? effectiveIncidentTitles[0]
  const gap = Math.max(0, passLine - score)
  const coneIncidentCount = incidents.length > 0
    ? incidents.filter(item => item.collision.object === 'traffic-cone').length
    : effectiveIncidentTitles.filter(title => /锥桶|雪糕桶|路锥|锥形桶/.test(title)).length
  const incidentNote = coneIncidentCount > 1
    ? `现场花絮：本次共与 ${coneIncidentCount} 个锥桶发生接触。教练让你绕桩，你这是来给锥桶点名的。`
    : primaryTypedIncident
      ? `现场花絮：${primaryTypedIncident.title}。 ${collisionIncidentRoast(primaryTypedIncident, [status, score, passLine, 'incident'].join('|'))}`
      : primaryIncidentTitle
        ? `现场花絮：${primaryIncidentTitle}。 ${infractionRoast(primaryIncidentTitle, [status, score, passLine, 'incident'].join('|'))}`
        : ''
  const appendIncident = (text: string) => incidentNote ? `${text} ${incidentNote}` : text

  if (status === 'incomplete') {
    return appendIncident(`${score} 分只是当前已记录的操作。先把全程跑完，再让合格线正式出场。`)
  }

  if (status === 'failed' && fatalCount > 0) {
    return appendIncident(primaryInfraction
      ? `教练重点点评：${primaryInfraction}。 ${infractionRoast(primaryInfraction, [status, score, passLine].join('|'))}`
      : '出现了不合格项目。好在这里是模拟器，问题暴露得越早越值。')
  }

  if (status === 'failed') {
    if (primaryInfraction) {
      return appendIncident(`距合格线还差 ${gap} 分。主要失误：${primaryInfraction}。 ${infractionRoast(primaryInfraction, [status, score, passLine].join('|'))}`)
    }
    return appendIncident(gap > 0
      ? `距合格线还差 ${gap} 分。别和分数讲道理，下一把把细节拿回来。`
      : '分数不是主要问题，先把已记录的关键失误处理掉。')
  }

  if (score === 100 && infractionTitles.length === 0) {
    return effectiveIncidentTitles.length > 0
      ? appendIncident('成绩单确实是零扣分，但现场并不算无事发生。')
      : '零扣分事件。今天的方向盘和你意见高度一致。'
  }

  if (infractionTitles.length === 0) {
    return appendIncident(score >= 95
      ? '全程没有记录到扣分事件，这把可以放心截图。'
      : '没有扣分事件，属于安安静静把事情办成了。')
  }

  const roast = infractionRoast(primaryInfraction, [status, score, passLine].join('|'))
  if (score >= 95) {
    return appendIncident(`${infractionTitles.length} 个扣分点来过，但没有把你从高分区拽下来。代表作：${primaryInfraction}。 ${roast}`)
  }
  if (score >= passLine + 5) {
    return appendIncident(`${infractionTitles.length} 个扣分点已经记账，但没拦住你过线。代表作：${primaryInfraction}。 ${roast}`)
  }
  return appendIncident(`${infractionTitles.length} 个扣分点陪你一起过线。代表作：${primaryInfraction}。 ${roast}`)
}

export function buildResultComment(input: ResultCommentInput): ResultComment {
  const {
    examTitle,
    score,
    passLine,
    status,
    resultLabel,
    infractionTitles,
    incidentTitles = [],
    incidents = [],
    fatalCount,
  } = input
  const effectiveIncidentTitles = incidents.length > 0 ? incidents.map(item => item.title) : incidentTitles
  const seed = [
    examTitle, score, passLine, status, fatalCount,
    ...infractionTitles,
    ...effectiveIncidentTitles,
    ...incidents.map(item => item.collision.object),
  ].join('|')
  const gap = Math.max(0, passLine - score)

  let badge: string
  let headline: string

  const context = contextualHeadline(
    effectiveIncidentTitles.length > 0 ? incidentTitles : infractionTitles,
    seed,
  )

  if (context) {
    badge = context.badge
    headline = context.headline
  } else if (status === 'incomplete') {
    badge = pick(INCOMPLETE_BADGES, seed + '|badge')
    headline = pick(INCOMPLETE, seed)
  } else if (status === 'failed' && fatalCount > 0) {
    badge = pick(FATAL_BADGES, seed + '|badge')
    headline = pick(FAILED_FATAL, seed)
  } else if (status === 'failed') {
    const close = gap <= 10
    badge = pick(close ? CLOSE_BADGES : FAR_BADGES, seed + '|badge')
    headline = pick(close ? FAILED_CLOSE : FAILED_FAR, seed)
  } else if (score === 100 && infractionTitles.length === 0 && effectiveIncidentTitles.length === 0) {
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

  const detail = buildDetail({ status, score, passLine, infractionTitles, incidentTitles, incidents, fatalCount })

  return {
    badge,
    headline,
    detail,
    shareText: `驾考模拟成绩：${score} 分 · ${resultLabel}\n${headline}\n${detail}\n—— ${examTitle}`,
  }
}

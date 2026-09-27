import { subject2EffectiveAreaInfraction } from './subject2/subject2EffectiveArea'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { ReverseParkingCourse, createReverseParkingRuntime, updateReverseParking } from './subject2/ReverseParkingCourse'
import { SideParkingCourse, createSideParkingRuntime, updateSideParking } from './subject2/SideParkingCourse'
import { RightAngleCourse, createRightAngleRuntime, updateRightAngle } from './subject2/RightAngleCourse'
import { CurveDrivingCourse, createCurveRuntime, updateCurveDriving } from './subject2/CurveDrivingCourse'
import { subject2StartPose, type Subject2ProjectId } from './subject2/courseStartPoses'
import { Subject2ExamCourse } from './subject2/Subject2ExamCourse'
import { SUBJECT2_EXAM_PLACEMENTS, subject2ExamDistanceToStart, subject2ExamLocalVehicle, subject2ExamSequence, subject2ExamWorldStartPose, subject2ProjectJudgingEnabled } from './subject2/subject2ExamLayout'
import { SlopeStartCourse, createSlopeRuntime, getSlopePose, updateSlopeStart } from './subject2/SlopeStartCourse'
import { DrivingCockpit } from './cockpit/DrivingCockpit'
import { DrivingLighting } from './cockpit/DrivingLighting'
import { DRIVER_EYE } from './cockpit/mirrorLayout'
import { Subject3Course, SUBJECT3_START, createSubject3Runtime, updateSubject3 } from './subject3/Subject3Course'
import {
  SUBJECT3_PRACTICE_SLICES,
  subject3PracticeInitialStatus,
  subject3PracticeRuntimeSeed,
  subject3PracticeSliceById,
  subject3PracticeSliceTitle,
  subject3PracticeStartPose,
  type Subject3PracticeSliceId,
} from './subject3/subject3Practice'
import { createSubject3TrafficState, type Subject3TrafficState } from './subject3/subject3Traffic'
import { observeSubject3LeadVehicle, observeSubject3OncomingVehicle } from './subject3/subject3LeadVehicle'
import { observeSubject3CutInHazard } from './subject3/subject3HazardObservation'
import { NightLightTest } from './subject3/NightLightTest'
import { DRIVING_RULES } from './rules/drivingRules'
import { subject3Infraction } from './rules/subject3Rules'
import { stepVehiclePhysics } from './sim/vehiclePhysics'
import { forwardFromHeading, rightFromHeading, worldPointFromVehicle } from './sim/vehicleFrame'
import { ExamReplay, type TrajectorySample } from './replay/ExamReplay'
import type { ReplayTrainingProjectId } from './replay/replayTrainingFocus'
import { appendExamHistory, loadCandidate, loadExamHistory, saveCandidate } from './storage/profileStorage'
import { RacingWheelSetup } from './input/RacingWheelSetup'
import { readRacingWheelControls } from './input/racingWheel'
import { clearDrivingKeys, sequentialDrivingGear, drivingKey, drivingLook, pressDrivingKey, releaseDrivingKey, type DrivingKeys } from './input/drivingKeyboard'
import { createKeyboardSteeringState, resetKeyboardSteering, stepKeyboardSteer } from './input/keyboardSteering'
import { createPedalControlsState, resetPedalControls, stepPedalControls } from './input/pedalControls'
import { createTurnSignalAutoCancelState, resetTurnSignalAutoCancel, stepTurnSignalAutoCancel } from './input/turnSignalAutoCancel'
import { createVehicleAudioState, updateTurnIndicatorAudio } from './audio/vehicleAudio'
import { advanceExamProgress, completeExamProject, createExamProgress, enterExamProject, isExamComplete } from './session/examProgress'
import { assessSessionResult, passLineForExam } from './session/sessionResult'
import { buildResultComment } from './session/resultComment'
import type { DrivingIncident, DrivingIncidentDraft } from './session/drivingIncident'
import { supportsWebGL2 } from './sim/webglSupport'
import { DrivingCanvasBoundary } from './ui/DrivingCanvasBoundary'
import { DrivingHelp } from './ui/DrivingHelp'
import { PedalReadout } from './ui/PedalReadout'
import { DrivingRendererLifecycle } from './ui/DrivingRendererLifecycle'
import { TrainingPackReport } from './training/TrainingPackReportPanel'
import type { TrainingPackStageResult } from './training/trainingPackReport'
import {
  appendTrainingPackHistory,
  buildTrainingPackHistoryEntry,
  loadTrainingPackHistory,
} from './training/trainingPackHistory'
import { buildTrainingPlan } from './training/trainingPlan'
import { TrainingPlanPanel } from './training/TrainingPlanPanel'
import { buildDailyTrainingPlan } from './training/dailyTrainingPlan'
import { TodayTrainingPlanPanel } from './training/TodayTrainingPlanPanel'
import {
  TRAINING_PACKS,
  nextTrainingPackState,
  trainingPackById,
  trainingPackStage,
  trainingPackStageLabel,
  type TrainingPackId,
  type TrainingPackSessionState,
} from './training/trainingPacks'

type Gender = '男' | '女' | '其他'
type LicenseType = 'C1' | 'C2'
type Phase = 'profile' | 'menu' | 'driving' | 'result'
type ExamId = 'reverse-parking' | 'side-parking' | 'slope-start' | 'curve-driving' | 'right-angle' | 'subject2-exam' | 'subject3'
type Mode = 'practice' | 'exam'
type TimeOfDay = 'day' | 'night'
type CameraMode = 'first' | 'second' | 'third' | 'top'

interface Candidate {
  name: string
  gender: Gender
  age: number
  licenseType: LicenseType
}
interface Vehicle {
  x: number
  z: number
  heading: number
  speed: number
  steering: number
  steeringWheelAngle: number
  throttle: number
  brake: number
  clutch: number
  gear: number
  engineOn: boolean
  engineRpm: number
  stallTimer: number
  handbrake: boolean
  leftIndicator: boolean
  rightIndicator: boolean
  hazard: boolean
  lowBeam: boolean
  highBeam: boolean
  horn: boolean
  seatbelt: boolean
  leftSignalAge: number
  rightSignalAge: number
  lookLeft: boolean
  lookRight: boolean
  lookBack: boolean
  biteLatched?: boolean
}
interface Infraction {
  id: string
  title: string
  points: number
  fatal?: boolean
  t?: number
  x?: number
  z?: number
  project?: string
}
interface Session {
  examId: ExamId
  mode: Mode
  time: TimeOfDay
  trainingPack?: TrainingPackSessionState
  subject3Practice?: Subject3PracticeSliceId
}

function createTrainingPackSession(
  id: TrainingPackId,
  time: TimeOfDay,
  index = 0,
): Session {
  const trainingPack: TrainingPackSessionState = { id, index }
  const stage = trainingPackStage(trainingPack)
  return {
    examId: stage.project as ExamId,
    mode: 'practice',
    time,
    trainingPack,
    subject3Practice: stage.subject3Practice,
  }
}

const projects = [
  ['reverse-parking', '倒车入库', '方向、车身位置与库线控制', '观察后视镜、库角与车身边线，完成入库和驶出。'],
  ['side-parking', '侧方停车', '靠边、倒车、入位与驶离', '训练右后视镜观察、转向时机、入库与驶离。'],
  ['slope-start', '坡道定点停车和起步', 'C1 项目', '训练定点、驻车、离合与油门配合以及防后溜。'],
  ['curve-driving', '曲线行驶', 'S 弯循迹', '低速通过连续曲线，训练方向节奏与车轮轨迹控制。'],
  ['right-angle', '直角转弯', '观察、打灯、转向', '训练车身边距、观察、转向灯和转向时机。'],
] as const

const examTitle = (examId: ExamId) => ({
  'reverse-parking': '倒车入库',
  'side-parking': '侧方停车',
  'slope-start': '坡道定点停车和起步',
  'curve-driving': '曲线行驶',
  'right-angle': '直角转弯',
  'subject2-exam': '科目二模拟考试',
  'subject3': '科目三道路驾驶',
}[examId])

const sessionTitle = (session: Session) => session.subject3Practice
  ? `科目三专项 · ${subject3PracticeSliceById(session.subject3Practice).title}`
  : examTitle(session.examId)

const historyTitle = (examId: ExamId, subject3Practice?: string) => {
  const sliceTitle = subject3PracticeSliceTitle(subject3Practice)
  return sliceTitle ? `科目三专项 · ${sliceTitle}` : examTitle(examId)
}

const initialProjectStatus = (
  examId: ExamId,
  subject3Practice?: Subject3PracticeSliceId,
) => {
  if (subject3Practice) return subject3PracticeInitialStatus(subject3Practice)
  if (examId === 'reverse-parking') return '驶过起始端控制线后停车，挂 R 挡开始第一次倒库'
  if (examId === 'side-parking') return '向前驶过库位，调整车身与右侧边线距离，准备挂 R 挡'
  if (examId === 'right-angle') return '进入直角转弯前开启左转向灯，控制车身靠右低速行驶'
  if (examId === 'curve-driving') return '曲线行驶：一挡低速前进进入 S 弯，保持车轮不触轧两侧边线'
  if (examId === 'slope-start') return '坡道定点停车：保持右侧车身距边线 30cm 内，将前保险杠停在桩杆线上'
  if (examId === 'subject3') return '科目三道路驾驶 · 请完成上车准备，系好安全带，开启左转向灯后安全起步'
  return ''
}

const initialVehicle = (
  examId?: ExamId,
  poseOverride?: { x: number; z: number; heading: number },
): Vehicle => {
  const subject2Start = subject2StartPose(examId)
  const subject3 = examId === 'subject3'
  const pose = poseOverride ?? subject2Start ?? (subject3 ? { ...SUBJECT3_START, heading: 0 } : { x: 0, z: 8, heading: 0 })
  return {
    x: pose.x,
    z: pose.z,
    heading: pose.heading,
    speed: 0,
    steering: 0,
    steeringWheelAngle: 0,
    throttle: 0,
    brake: 0,
    clutch: 0,
    gear: 0,
    engineOn: false,
    engineRpm: 0,
    stallTimer: 0,
    handbrake: true,
    leftIndicator: false,
    rightIndicator: false,
    hazard: false,
    lowBeam: false,
    highBeam: false,
    horn: false,
    seatbelt: false,
    leftSignalAge: 0,
    rightSignalAge: 0,
    lookLeft: false,
    lookRight: false,
    lookBack: false,
    biteLatched: false,
  }
}

function Profile({ onSubmit }: { onSubmit: (candidate: Candidate) => void }) {
  const savedCandidate = useMemo(() => loadCandidate(), [])
  const [name, setName] = useState(savedCandidate?.name ?? '')
  const [gender, setGender] = useState<Gender>(savedCandidate?.gender ?? '男')
  const [age, setAge] = useState(savedCandidate?.age ?? 18)
  const [licenseType, setLicenseType] = useState<LicenseType>(savedCandidate?.licenseType ?? 'C1')
  return <main className="shell centered"><section className="hero-card">
    <div className="eyebrow">中国大陆驾考 · 三维模拟训练</div>
    <h1>建立考生档案</h1>
    <p className="lead">档案用于当前浏览器内的训练与模拟考试成绩单。</p>
    <form className="profile-form" onSubmit={e => {
      e.preventDefault()
      if (name.trim()) {
        const candidate = { name: name.trim(), gender, age, licenseType }
        saveCandidate(candidate)
        onSubmit(candidate)
      }
    }}>
      <label>姓名<input required maxLength={20} placeholder="请输入姓名" value={name} onChange={e => setName(e.target.value)} /></label>
      <div className="form-row">
        <label>性别<select value={gender} onChange={e => setGender(e.target.value as Gender)}><option>男</option><option>女</option><option>其他</option></select></label>
        <label>年龄<input type="number" min={18} max={80} value={age} onChange={e => setAge(Number(e.target.value))} /></label>
        <label>准驾车型<select value={licenseType} onChange={e => setLicenseType(e.target.value as LicenseType)}><option value="C1">C1 手动挡</option><option value="C2">C2 自动挡</option></select></label>
      </div>
      <button className="primary">进入训练中心</button>
    </form>
  </section></main>
}

function Menu({ candidate, onStart, onStartTrainingPack, onSwitchCandidate }: { candidate: Candidate, onStart: (s: Session) => void, onStartTrainingPack: (id: TrainingPackId, time: TimeOfDay) => void, onSwitchCandidate: () => void }) {
  const [mode, setMode] = useState<Mode>('practice')
  const [time, setTime] = useState<TimeOfDay>('day')
  const visible = projects.filter(p => !(candidate.licenseType === 'C2' && p[0] === 'slope-start'))
  const recentHistory = useMemo(
    () => loadExamHistory().filter(item => item.candidateName === candidate.name).slice(0, 4),
    [candidate.name],
  )
  const trainingPackHistory = useMemo(
    () => loadTrainingPackHistory({
      candidateName: candidate.name,
      licenseType: candidate.licenseType,
    }),
    [candidate.name, candidate.licenseType],
  )
  const trainingPlan = useMemo(
    () => buildTrainingPlan({
      candidateName: candidate.name,
      licenseType: candidate.licenseType,
      history: trainingPackHistory,
    }),
    [candidate.name, candidate.licenseType, trainingPackHistory],
  )
  const dailyTrainingPlan = useMemo(
    () => buildDailyTrainingPlan({
      candidateName: candidate.name,
      licenseType: candidate.licenseType,
      history: trainingPackHistory,
      trainingPlan,
      now: Date.now(),
    }),
    [candidate.name, candidate.licenseType, trainingPackHistory, trainingPlan],
  )
  return <main className="shell menu-shell">
    <header className="topbar"><div><div className="eyebrow">驾驶训练中心</div><h1>{candidate.name}，选择训练任务</h1></div><div className="candidate-actions"><div className="candidate-pill">{candidate.licenseType} · {candidate.gender} · {candidate.age} 岁</div><button className="ghost-btn" onClick={onSwitchCandidate}>切换考生</button></div></header>
    <section className="toolbar">
      <div className="segmented"><button className={mode === 'practice' ? 'active' : ''} onClick={() => setMode('practice')}>训练模式</button><button className={mode === 'exam' ? 'active' : ''} onClick={() => setMode('exam')}>考试模式</button></div>
      <div className="segmented"><button className={time === 'day' ? 'active' : ''} onClick={() => setTime('day')}>白天</button><button className={time === 'night' ? 'active' : ''} onClick={() => setTime('night')}>夜间</button></div>
    </section>
    <RacingWheelSetup />
    <TodayTrainingPlanPanel
      plan={dailyTrainingPlan}
      onStartPack={packId => onStartTrainingPack(packId, time)}
    />
    <TrainingPlanPanel
      plan={trainingPlan}
      onStartPack={packId => onStartTrainingPack(packId, time)}
    />
    <section className="training-pack-section">
      <div className="section-heading"><div><span className="chapter">专项训练</span><h2>针对薄弱习惯连续练习</h2></div><p>训练包固定使用训练模式，按顺序切换项目；每一阶段都保留独立成绩与复盘证据。</p></div>
      <div className="training-pack-grid">
        {TRAINING_PACKS.map(pack => <button
          key={pack.id}
          className="training-pack-card"
          onClick={() => onStartTrainingPack(pack.id, time)}
        >
          <span className="training-pack-count">{pack.stages.length} 项</span>
          <h3>{pack.title}</h3>
          <p>{pack.summary}</p>
          <span className="training-pack-route">
            {pack.stages.map(stage => stage.label).join(' → ')}
          </span>
          <span className="enter">开始训练包 →</span>
        </button>)}
      </div>
    </section>
    {recentHistory.length > 0 && <section className="recent-results">
      <div className="recent-results-head"><div><span className="chapter">最近记录</span><h3>本地训练成绩</h3></div><span>仅保存在当前浏览器</span></div>
      <div className="recent-results-grid">
        {recentHistory.map(item => <div className="recent-result" key={item.id}>
          <div><strong>{historyTitle(item.examId as ExamId, item.subject3Practice)}</strong><span>{item.mode === 'exam' ? '模拟考试' : '训练'} · {new Date(item.createdAt).toLocaleDateString()}{item.status === 'incomplete' ? ' · 未完成' : ''}</span></div>
          <b className={item.passed ? 'history-pass' : 'history-fail'}>{item.score}</b>
        </div>)}
      </div>
    </section>}
    <section>
      <div className="section-heading"><div><span className="chapter">第一章</span><h2>科目二 · 场地驾驶技能</h2></div><p>每个项目可单独训练，并提供组合模拟考试入口。</p></div>
      <div className="card-grid">
        {visible.map((p, index) => <button key={p[0]} className="task-card" onClick={() => onStart({ examId: p[0] as ExamId, mode, time })}>
          <span className="task-index">{String(index + 1).padStart(2, '0')}</span><h3>{p[1]}</h3><b>{p[2]}</b><p>{p[3]}</p><span className="enter">开始 →</span>
        </button>)}
        <button className="task-card exam-card" onClick={() => onStart({ examId: 'subject2-exam', mode: 'exam', time })}>
          <span className="task-index">EXAM</span><h3>科目二模拟考试</h3><b>{candidate.licenseType} 连续项目</b><p>按当前准驾车型连续完成适用项目，统一记录操作与成绩。</p><span className="enter">进入考试 →</span>
        </button>
      </div>
    </section>
    <section className="subject3-section">
      <div className="section-heading"><div><span className="chapter">第二章</span><h2>科目三 · 道路驾驶技能</h2></div><p>连续道路章节，包含动态交通和考试任务。</p></div>
      <button className="subject3-card" onClick={() => onStart({ examId: 'subject3', mode, time })}>
        <div><span className="task-index">ROAD</span><h3>综合道路驾驶</h3><p>覆盖上车准备、起步、直线、加减挡、变道、靠边停车、路口、人行横道、学校、公交站、会车、超车、掉头、夜间行驶等训练场景。</p></div><span className="enter">进入 3D 道路 →</span>
      </button>
      <div className="subject3-practice-grid" aria-label="科目三专项短练">
        {SUBJECT3_PRACTICE_SLICES.map(slice => <button
          key={slice.id}
          className="subject3-practice-card"
          onClick={() => onStart({
            examId: 'subject3',
            mode: 'practice',
            time,
            subject3Practice: slice.id,
          })}
        >
          <span className="task-index">DRILL</span>
          <strong>{slice.title}</strong>
          <p>{slice.summary}</p>
          <span className="enter">专项短练 →</span>
        </button>)}
      </div>
    </section>
    <aside className="legal-note">规则基线按现行中国大陆机动车驾驶人考试规范建模；实际考场路线、检测设备和地方执行细节可能不同。本项目用于模拟训练，不替代当地主管部门要求。</aside>
  </main>
}

function Road() {
  const dashes = useMemo(() => Array.from({ length: 90 }, (_, i) => 25 - i * 5), [])
  const trees = useMemo(() => Array.from({ length: 48 }, (_, i) => ({ side: i % 2 ? 1 : -1, z: 18 - Math.floor(i / 2) * 17, offset: (i % 5) * .6 })), [])
  return <group>
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.025, -185]} receiveShadow><planeGeometry args={[18, 440]} /><meshStandardMaterial color="#3b4044" roughness={1} /></mesh>
    {[-9, 9].map(x => <mesh key={x} rotation-x={-Math.PI / 2} position={[x, -0.012, -185]}><planeGeometry args={[.16, 440]} /><meshBasicMaterial color="#f5f5e8" /></mesh>)}
    {dashes.map(z => <mesh key={z} rotation-x={-Math.PI / 2} position={[0, -.011, z]}><planeGeometry args={[.12, 2.5]} /><meshBasicMaterial color="#e8e5cf" /></mesh>)}
    <group position={[0, .002, -42]}>
      {Array.from({ length: 7 }, (_, i) => <mesh key={i} rotation-x={-Math.PI / 2} position={[-6 + i * 2, 0, 0]}><planeGeometry args={[1, 4]} /><meshBasicMaterial color="#fafafa" /></mesh>)}
    </group>
    {trees.map((t, i) => <group key={i} position={[t.side * (12 + t.offset), 0, t.z]}>
      <mesh position={[0, 1.1, 0]} castShadow><cylinderGeometry args={[.15, .2, 2.2, 8]} /><meshStandardMaterial color="#5f5140" /></mesh>
      <mesh position={[0, 3, 0]} castShadow><sphereGeometry args={[1.25, 12, 8]} /><meshStandardMaterial color="#3d6545" /></mesh>
    </group>)}
    <group position={[-7, 0, -29]}>
      <mesh position={[0, 1.6, -0.06]} castShadow><cylinderGeometry args={[.06, .08, 3.2, 8]} /><meshStandardMaterial color="#777" /></mesh>
      <mesh position={[0, 3.1, 0.02]} castShadow><boxGeometry args={[1.2, 1.2, .06]} /><meshStandardMaterial color="#1766a3" /></mesh>
    </group>
  </group>
}

function DrivingWorld({ vehicle, session, automatic, continuousExam, projectJudgingEnabled, controlsLocked, cameraMode, onCycleCameraMode, onToggleHelp, onReady, onInfraction, onIncident, onTick, onProjectStatus, onProjectComplete }: {
  vehicle: React.MutableRefObject<Vehicle>, session: Session, automatic: boolean, continuousExam: boolean, projectJudgingEnabled: boolean, controlsLocked: boolean,
  cameraMode: CameraMode,
  onCycleCameraMode: () => void,
  onToggleHelp: () => void,
  onReady: () => void,
  onInfraction: (i: Infraction) => void,
  onIncident: (incident: DrivingIncidentDraft) => void,
  onTick: (traffic?: Readonly<Subject3TrafficState>) => void,
  onProjectStatus: (status: string) => void,
  onProjectComplete: () => void
}) {
  const keys = useRef<DrivingKeys>({})
  const inputReady = useRef(false)
  const readyReported = useRef(false)
  const keyboardSteeringState = useRef(createKeyboardSteeringState())
  const pedalControlsState = useRef(createPedalControlsState())
  const turnSignalAutoCancelState = useRef(createTurnSignalAutoCancelState())
  const vehicleAudioState = useRef(createVehicleAudioState())
  const cameraYaw = useRef(0)
  const { camera } = useThree()
  const speedTimer = useRef(0)
  const reverseParkingRuntime = useRef(createReverseParkingRuntime())
  const sideParkingRuntime = useRef(createSideParkingRuntime())
  const rightAngleRuntime = useRef(createRightAngleRuntime())
  const curveRuntime = useRef(createCurveRuntime())
  const slopeRuntime = useRef(createSlopeRuntime())
  const subject3Runtime = useRef(createSubject3Runtime(
    session.subject3Practice
      ? subject3PracticeRuntimeSeed(session.subject3Practice)
      : undefined,
  ))
  const subject3Traffic = useRef(createSubject3TrafficState())
  const runtimeProject = useRef(session.examId)
  const carGroup = useRef<THREE.Group>(null)
  const lastProjectStatus = useRef('')
  const completionLatched = useRef(false)
  const audioContext = useRef<AudioContext | null>(null)
  const hornNodes = useRef<{ oscillators: OscillatorNode[]; gain: GainNode } | null>(null)
  const stallCount = useRef(0)

  const startHorn = () => {
    if (hornNodes.current) return
    const context = audioContext.current ?? new AudioContext()
    audioContext.current = context
    if (context.state === 'suspended') void context.resume()
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.035, context.currentTime)
    gain.connect(context.destination)
    const oscillators = [415, 520].map(frequency => {
      const oscillator = context.createOscillator()
      oscillator.type = 'square'
      oscillator.frequency.setValueAtTime(frequency, context.currentTime)
      oscillator.connect(gain)
      oscillator.start()
      return oscillator
    })
    hornNodes.current = { oscillators, gain }
  }

  const stopHorn = () => {
    const active = hornNodes.current
    if (!active) return
    active.oscillators.forEach(oscillator => {
      try { oscillator.stop() } catch { /* already stopped */ }
      oscillator.disconnect()
    })
    active.gain.disconnect()
    hornNodes.current = null
  }

  useEffect(() => {
    const syncLook = () => {
      const { yaw, ...look } = drivingLook(keys.current)
      cameraYaw.current = yaw
      Object.assign(vehicle.current, look)
    }
    const releaseAll = () => {
      clearDrivingKeys(keys.current)
      resetKeyboardSteering(keyboardSteeringState.current)
      resetPedalControls(pedalControlsState.current)
      syncLook()
      const v = vehicle.current
      v.throttle = 0
      v.brake = 0
      v.clutch = 0
      v.horn = false
      stopHorn()
    }
    const down = (e: KeyboardEvent) => {
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) { releaseAll(); return }
      const target = e.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return
      const k = drivingKey(e)
      if (!k) return
      if (k === 'space' && target instanceof HTMLElement && target.closest('button')) return
      e.preventDefault()
      const firstPress = pressDrivingKey(keys.current, k, e.repeat)
      syncLook()
      if (!firstPress) return
      if (!audioContext.current) {
        const ctx = new AudioContext()
        audioContext.current = ctx
        if (ctx.state === 'suspended') void ctx.resume()
      } else if (audioContext.current?.state === 'suspended') {
        void audioContext.current.resume()
      }
      const v = vehicle.current
      if (k === 'space') v.handbrake = !v.handbrake
      if (k === 'i') {
        v.engineOn = !v.engineOn
        v.engineRpm = v.engineOn ? DRIVING_RULES.manualTransmission.idleRpm : 0
        v.stallTimer = 0
      }
      if (k === 'q') { v.leftIndicator = !v.leftIndicator; v.rightIndicator = false }
      if (k === 'e') { v.rightIndicator = !v.rightIndicator; v.leftIndicator = false }
      if (k === 'v') v.hazard = !v.hazard
      if (k === 'l') { v.lowBeam = !v.lowBeam; v.highBeam = false }
      if (k === 'k') { v.highBeam = !v.highBeam; if (v.highBeam) v.lowBeam = true }
      if (k === '[' || k === ']') v.gear = sequentialDrivingGear(v.gear, k === '[' ? -1 : 1, automatic)
      if (k === 'h') onToggleHelp()
      if (k === 'n') v.gear = 0
      if (k === 'r') v.gear = -1
      if (automatic && k === 'g') v.gear = 1
      if (!automatic && /^[1-5]$/.test(k)) v.gear = Number(k)
      if (k === 'b') { v.horn = true; startHorn() }
      if (k === 't') v.seatbelt = !v.seatbelt
      if (k === 'm') onCycleCameraMode()
    }
    const up = (e: KeyboardEvent) => {
      const k = drivingKey(e)
      if (!k) return
      releaseDrivingKey(keys.current, k)
      syncLook()
      if (k === 'b') { vehicle.current.horn = false; stopHorn() }
    }
    const visibilityChanged = () => {
      if (document.hidden) releaseAll()
    }
    addEventListener('keydown', down)
    addEventListener('keyup', up)
    addEventListener('blur', releaseAll)
    document.addEventListener('visibilitychange', visibilityChanged)
    inputReady.current = true
    return () => {
      inputReady.current = false
      removeEventListener('keydown', down)
      removeEventListener('keyup', up)
      removeEventListener('blur', releaseAll)
      document.removeEventListener('visibilitychange', visibilityChanged)
      releaseAll()
      void audioContext.current?.close()
      audioContext.current = null
    }
  }, [automatic, onCycleCameraMode, onToggleHelp, vehicle])

  useFrame((_, rawDt) => {
    // Keep the world, cockpit, input and session counters mounted across courses.
    // Reset only project judges, before the first frame of the new project.
    if (runtimeProject.current !== session.examId) {
      runtimeProject.current = session.examId
      resetKeyboardSteering(keyboardSteeringState.current)
      resetPedalControls(pedalControlsState.current)
      resetTurnSignalAutoCancel(turnSignalAutoCancelState.current)
      reverseParkingRuntime.current = createReverseParkingRuntime()
      sideParkingRuntime.current = createSideParkingRuntime()
      rightAngleRuntime.current = createRightAngleRuntime()
      curveRuntime.current = createCurveRuntime()
      slopeRuntime.current = createSlopeRuntime()
      subject3Runtime.current = createSubject3Runtime(
        session.subject3Practice
          ? subject3PracticeRuntimeSeed(session.subject3Practice)
          : undefined,
      )
      lastProjectStatus.current = ''
      completionLatched.current = false
    }
    const dt = Math.min(rawDt, .05)
    const v = vehicle.current
    const wheel = readRacingWheelControls()
    const pedalOutput = stepPedalControls(pedalControlsState.current, {
      throttleKey: !controlsLocked && !wheel.deviceId && !!(keys.current['w'] || keys.current['arrowup']),
      brakeKey: !controlsLocked && !wheel.deviceId && !!(keys.current['s'] || keys.current['arrowdown']),
      clutchFloorKey: !controlsLocked && !wheel.deviceId && !automatic && !!keys.current['c'],
      clutchBiteKey: !controlsLocked && !wheel.deviceId && !automatic && !!keys.current['shift'],
      automatic,
      speed: v.speed,
      gear: v.gear,
      dt,
    })
    v.biteLatched = pedalOutput.biteLatched
    const keyboardThrottle = pedalOutput.throttle
    const keyboardBrake = pedalOutput.brake
    const keyboardClutch = pedalOutput.clutch
    const keyboardSteer = stepKeyboardSteer(keyboardSteeringState.current, {
      left: !controlsLocked && !wheel.deviceId && !!(keys.current['a'] || keys.current['arrowleft']),
      right: !controlsLocked && !wheel.deviceId && !!(keys.current['d'] || keys.current['arrowright']),
      center: !controlsLocked && !wheel.deviceId && !!keys.current.j,
      currentAngle: v.steeringWheelAngle,
      speed: v.speed,
      dt,
    })

    const throttle = controlsLocked ? 0 : wheel.deviceId ? wheel.throttle : keyboardThrottle
    const brake = controlsLocked ? 0 : wheel.deviceId ? wheel.brake : keyboardBrake
    const clutch = controlsLocked || automatic
      ? 0
      : wheel.deviceId && wheel.clutch != null
        ? wheel.clutch
        : keyboardClutch
    const steer = controlsLocked || wheel.deviceId ? 0 : keyboardSteer
    const slopeVehicleBefore = continuousExam && session.examId === 'slope-start'
      ? subject2ExamLocalVehicle('slope-start', v)
      : v
    const slopeBeforeStep = session.examId === 'slope-start' ? getSlopePose(slopeVehicleBefore.z) : { y: 0, pitch: 0, grade: 0 }
    const slopeGradeHeading = continuousExam && session.examId === 'slope-start'
      ? SUBJECT2_EXAM_PLACEMENTS['slope-start'].heading
      : 0
    const physics = stepVehiclePhysics(v, {
      throttle,
      brake,
      clutch,
      steer,
      steeringWheelTarget: controlsLocked || !wheel.deviceId
        ? undefined
        : wheel.steering * DRIVING_RULES.steering.wheelTurnsLockToLock * Math.PI,
    }, dt, {
      automatic,
      grade: slopeBeforeStep.grade,
      gradeHeading: slopeGradeHeading,
    })
    if (physics.stalled) {
      stallCount.current += 1
      onInfraction({
        id: `engine-stall-${stallCount.current}`,
        title: '因操作不当造成发动机熄火',
        points: 10,
      })
    }
    const turnSignal = stepTurnSignalAutoCancel(turnSignalAutoCancelState.current, {
      steeringWheelAngle: v.steeringWheelAngle,
      leftIndicator: v.leftIndicator,
      rightIndicator: v.rightIndicator,
      hazard: v.hazard,
    })
    v.leftIndicator = turnSignal.leftIndicator
    v.rightIndicator = turnSignal.rightIndicator
    v.leftSignalAge = v.leftIndicator ? v.leftSignalAge + dt : 0
    v.rightSignalAge = v.rightIndicator ? v.rightSignalAge + dt : 0
    const indicatorActive = v.leftIndicator || v.rightIndicator || v.hazard
    updateTurnIndicatorAudio(
      vehicleAudioState.current,
      audioContext.current,
      indicatorActive,
      dt,
    )

  }, -2) // Integrate once before all shared course collision bodies.

  useFrame((_, rawDt) => {
    // Collisions run at -1: the camera, judges and replay see the resolved pose.
    const dt = Math.min(rawDt, .05)
    const v = vehicle.current
    const judgedVehicle = continuousExam
      ? subject2ExamLocalVehicle(session.examId as Subject2ProjectId, v)
      : v
    const roadPose = session.examId === 'slope-start' ? getSlopePose(judgedVehicle.z) : { y: 0, pitch: 0, grade: 0 }
    if (carGroup.current) {
      carGroup.current.position.set(v.x, roadPose.y, v.z)
      carGroup.current.rotation.set(roadPose.pitch, -v.heading, 0)
    }
    const perspectiveCamera = camera as THREE.PerspectiveCamera
    const forwardFrame = forwardFromHeading(v.heading)
    const rightFrame = rightFromHeading(v.heading)
    const forward = new THREE.Vector3(forwardFrame.x, 0, forwardFrame.z)
    const right = new THREE.Vector3(rightFrame.x, 0, rightFrame.z)
    const vehicleCenter = new THREE.Vector3(v.x, roadPose.y + 0.9, v.z)

    if (cameraMode === 'first') {
      const driverRightOffset = DRIVER_EYE.right
      const driverForwardOffset = DRIVER_EYE.forward
      const driver = worldPointFromVehicle(v.x, v.z, v.heading, driverForwardOffset, driverRightOffset)
      camera.position.set(
        driver.x,
        roadPose.y + DRIVER_EYE.height,
        driver.z,
      )
      camera.rotation.set(roadPose.pitch - 0.015, -v.heading + cameraYaw.current, 0)
      if (perspectiveCamera.fov !== 68) {
        perspectiveCamera.fov = 68
        perspectiveCamera.updateProjectionMatrix()
      }
    } else if (cameraMode === 'second') {
      const observer = vehicleCenter.clone()
        .add(forward.clone().multiplyScalar(4.8))
        .add(right.clone().multiplyScalar(-2.6))
      observer.y = roadPose.y + 1.9
      camera.position.copy(observer)
      camera.up.set(0, 1, 0)
      camera.lookAt(vehicleCenter.clone().add(new THREE.Vector3(0, 0.1, 0)))
      if (perspectiveCamera.fov !== 52) {
        perspectiveCamera.fov = 52
        perspectiveCamera.updateProjectionMatrix()
      }
    } else if (cameraMode === 'third') {
      const chase = vehicleCenter.clone()
        .add(forward.clone().multiplyScalar(-6.2))
        .add(right.clone().multiplyScalar(-3.0))
      chase.y = roadPose.y + 2.8
      camera.position.copy(chase)
      camera.up.set(0, 1, 0)
      camera.lookAt(vehicleCenter.clone().add(forward.clone().multiplyScalar(0.8)))
      if (perspectiveCamera.fov !== 52) {
        perspectiveCamera.fov = 52
        perspectiveCamera.updateProjectionMatrix()
      }
    } else {
      const overhead = vehicleCenter.clone()
      overhead.y = roadPose.y + 11.5
      camera.position.copy(overhead)

      // Looking straight down makes the normal Y-up vector degenerate.
      // Use the vehicle forward vector as camera-up so the car's nose stays
      // at the top of the screen while preserving a truly vertical view.
      camera.up.copy(forward).normalize()
      camera.lookAt(new THREE.Vector3(v.x, roadPose.y, v.z))
      if (perspectiveCamera.fov !== 42) {
        perspectiveCamera.fov = 42
        perspectiveCamera.updateProjectionMatrix()
      }
    }

    if (session.examId !== 'subject3') {
      if (Math.abs(v.speed) * 3.6 > 12) {
        speedTimer.current += dt
        if (speedTimer.current > 1.2) {
          onInfraction({ id: 'speed-control', title: '训练区域速度控制不当', points: 10 })
        }
      } else {
        speedTimer.current = 0
      }
      if (session.mode === 'exam' && Math.abs(v.speed) > .25 && v.handbrake) {
        onInfraction({ id: 'parking-brake', title: '未松驻车制动器起步', points: 10 })
      }
      if (Math.abs(v.speed) > .25 && !v.seatbelt) {
        onInfraction({ id: 'seatbelt-not-fastened', title: '起步或行驶时未按规定使用安全带', points: 100, fatal: true })
      }
    } else {
      speedTimer.current = 0
    }
    if (session.examId !== 'subject3') {
      const outsideArea = subject2EffectiveAreaInfraction(v, session.examId as Subject2ProjectId, continuousExam, automatic)
      if (outsideArea) onInfraction(outsideArea)
    }

    let projectUpdate: { status: string; infractions: Infraction[] } | null = null
    let projectCompleted = false
    if (projectJudgingEnabled) {
      if (session.examId === 'reverse-parking') {
        const update = updateReverseParking(judgedVehicle, reverseParkingRuntime.current, dt)
        reverseParkingRuntime.current = update.runtime
        projectUpdate = update
        projectCompleted = update.runtime.completed
      } else if (session.examId === 'side-parking') {
        const update = updateSideParking(judgedVehicle, sideParkingRuntime.current, dt)
        sideParkingRuntime.current = update.runtime
        projectUpdate = update
        projectCompleted = update.runtime.completed
      } else if (session.examId === 'right-angle') {
        const update = updateRightAngle(judgedVehicle, rightAngleRuntime.current, dt)
        rightAngleRuntime.current = update.runtime
        projectUpdate = update
        projectCompleted = update.runtime.completed
      } else if (session.examId === 'curve-driving') {
        const update = updateCurveDriving(judgedVehicle, curveRuntime.current, dt)
        curveRuntime.current = update.runtime
        projectUpdate = update
        projectCompleted = update.runtime.completed
      } else if (session.examId === 'slope-start') {
        const update = updateSlopeStart(judgedVehicle, slopeRuntime.current, dt)
        slopeRuntime.current = update.runtime
        projectUpdate = update
        projectCompleted = update.runtime.completed
      } else if (session.examId === 'subject3') {
        const update = updateSubject3(
          v,
          subject3Runtime.current,
          automatic,
          session.time === 'night',
          dt,
          subject3Traffic.current,
          session.mode === 'exam',
          session.subject3Practice,
        )
        subject3Runtime.current = update.runtime
        projectUpdate = update
        projectCompleted = update.runtime.completed
      }
    }
    if (projectUpdate) {
      projectUpdate.infractions.forEach(onInfraction)
      if (projectUpdate.status !== lastProjectStatus.current) {
        lastProjectStatus.current = projectUpdate.status
        onProjectStatus(projectUpdate.status)
      }
      if (projectCompleted && !completionLatched.current) {
        completionLatched.current = true
        onProjectComplete()
      }
    }

    onTick(session.examId === 'subject3' ? subject3Traffic.current : undefined)
    if (inputReady.current && !readyReported.current) {
      readyReported.current = true
      onReady()
    }
  })

  const night = session.time === 'night'
  return <>
    <fog attach="fog" args={[night ? '#142034' : '#c7d5d9', 65, 260]} />
    <DrivingLighting vehicle={vehicle} night={night} />
    {continuousExam ? (
      <Subject2ExamCourse
        automatic={automatic}
        activeProject={session.examId as Subject2ProjectId}
        vehicle={vehicle}
        audioContext={audioContext.current}
        audioState={vehicleAudioState.current}
        onIncident={onIncident}
      />
    ) : session.examId === 'reverse-parking' ? (
      <ReverseParkingCourse
        vehicle={vehicle}
        audioContext={audioContext.current}
        audioState={vehicleAudioState.current}
        onIncident={onIncident}
      />
    ) : session.examId === 'side-parking' ? (
      <SideParkingCourse
        vehicle={vehicle}
        audioContext={audioContext.current}
        audioState={vehicleAudioState.current}
        onIncident={onIncident}
      />
    ) : session.examId === 'right-angle' ? (
      <RightAngleCourse
        vehicle={vehicle}
        audioContext={audioContext.current}
        audioState={vehicleAudioState.current}
        onIncident={onIncident}
      />
    ) : session.examId === 'curve-driving' ? (
      <CurveDrivingCourse />
    ) : session.examId === 'slope-start' ? (
      <SlopeStartCourse
        vehicle={vehicle}
        audioContext={audioContext.current}
        audioState={vehicleAudioState.current}
        onIncident={onIncident}
      />
    ) : session.examId === 'subject3' ? (
      <Subject3Course
        player={vehicle}
        traffic={subject3Traffic}
        onInfraction={onInfraction}
        audioContext={audioContext.current}
        audioState={vehicleAudioState.current}
      />
    ) : (
      <Road />
    )}
    <group ref={carGroup}><DrivingCockpit vehicle={vehicle} showClutch={!automatic} automatic={automatic} /></group>
    <mesh rotation-x={-Math.PI / 2} position={[0, -.08, -185]}><planeGeometry args={[260, 500]} /><meshStandardMaterial color={night ? '#14201a' : '#657b59'} /></mesh>
  </>
}

function Driving({ session, candidate, onIncident, onDone, onExit }: { session: Session, candidate: Candidate, onIncident: (incident: DrivingIncident) => void, onDone: (score: number, infractions: Infraction[], trajectory: TrajectorySample[], completed: boolean) => void, onExit: () => void }) {
  const [drivingReady, setDrivingReady] = useState(false)
  const markDrivingReady = useCallback(() => setDrivingReady(true), [])
  const [helpExpanded, setHelpExpanded] = useState(false)
  const toggleHelp = useCallback(() => setHelpExpanded(value => !value), [])
  const combinedExam = session.examId === 'subject2-exam'
  const trainingPack = session.trainingPack ? trainingPackById(session.trainingPack.id) : null
  const automatic = candidate.licenseType === 'C2'
  const [webglAvailable, setWebglAvailable] = useState(() => supportsWebGL2())
  const [rendererFailed, setRendererFailed] = useState(false)
  const examSequence: ExamId[] = subject2ExamSequence(automatic)
  const [progress, setProgress] = useState(() => createExamProgress<ExamId>(combinedExam ? examSequence[0] : session.examId))
  const activeExamId = progress.project
  const activeIndex = combinedExam ? examSequence.indexOf(activeExamId) : 0
  const projectComplete = progress.completed
  const activeEntryReached = progress.entered
  const sessionComplete = isExamComplete(progress, combinedExam ? examSequence : undefined)
  const effectiveSession: Session = { ...session, examId: activeExamId }
  const combinedStartPose = combinedExam
    ? subject2ExamWorldStartPose(examSequence[0] as Subject2ProjectId)
    : undefined
  const subject3PracticePose = session.subject3Practice
    ? subject3PracticeStartPose(session.subject3Practice)
    : undefined
  const sessionStartPose = combinedStartPose ?? subject3PracticePose
  const vehicle = useRef(initialVehicle(activeExamId, sessionStartPose))
  const [display, setDisplay] = useState(() => initialVehicle(activeExamId, sessionStartPose))
  const [infractions, setInfractions] = useState<Infraction[]>([])
  const [projectStatus, setProjectStatus] = useState(
    initialProjectStatus(activeExamId, session.subject3Practice),
  )
  const [lightTestDone, setLightTestDone] = useState(
    !(activeExamId === 'subject3' && session.time === 'day' && !session.subject3Practice),
  )
  const [cameraMode, setCameraMode] = useState<CameraMode>('first')
  const cycleCameraMode = useCallback(() => setCameraMode(mode =>
    mode === 'first' ? 'second'
      : mode === 'second' ? 'third'
        : mode === 'third' ? 'top'
          : 'first'
  ), [])
  const finishLatched = useRef(false)
  const lastUi = useRef(0)
  const sessionStartedAt = useRef(performance.now())
  const lastTrajectorySampleAt = useRef(0)
  const trajectory = useRef<TrajectorySample[]>([])
  const replayProjectId =
    combinedExam && activeIndex > 0 && !activeEntryReached
      ? `transition:${examSequence[activeIndex - 1]}:${activeExamId}`
      : activeExamId
  const activeReplayVehicle = () =>
    combinedExam && replayProjectId === activeExamId
      ? subject2ExamLocalVehicle(activeExamId as Subject2ProjectId, vehicle.current)
      : vehicle.current
  const addInfraction = (item: Infraction) => setInfractions(prev => {
    if (prev.some(x => x.id === item.id)) return prev
    const now = performance.now()
    const replayVehicle = activeReplayVehicle()
    return [...prev, {
      ...item,
      t: (now - sessionStartedAt.current) / 1000,
      x: replayVehicle.x,
      z: replayVehicle.z,
      project: replayProjectId,
    }]
  })
  const addIncident = (item: DrivingIncidentDraft) => {
    const now = performance.now()
    const replayVehicle = activeReplayVehicle()
    onIncident({
      ...item,
      t: (now - sessionStartedAt.current) / 1000,
      x: replayVehicle.x,
      z: replayVehicle.z,
      project: replayProjectId,
    })
  }

  useEffect(() => {
    if (!combinedExam) {
      const resetPose = session.subject3Practice
        ? subject3PracticeStartPose(session.subject3Practice)
        : undefined
      const resetVehicle = initialVehicle(activeExamId, resetPose)
      vehicle.current = resetVehicle
      setDisplay(resetVehicle)
    } else {
      setDisplay({ ...vehicle.current })
    }
    setProjectStatus(initialProjectStatus(activeExamId, session.subject3Practice))
    setLightTestDone(
      !(activeExamId === 'subject3' && session.time === 'day' && !session.subject3Practice),
    )
  }, [activeExamId, combinedExam, session.subject3Practice, session.time])

  const tick = (traffic?: Readonly<Subject3TrafficState>) => {
    const now = performance.now()
    if (now - lastUi.current > 80) {
      lastUi.current = now
      setDisplay({ ...vehicle.current })
    }
    if (trajectory.current.length === 0 || now - lastTrajectorySampleAt.current > 180) {
      lastTrajectorySampleAt.current = now
      const v = vehicle.current
      const replayVehicle = activeReplayVehicle()
      const leadVehicle =
        activeExamId === 'subject3' && traffic
          ? observeSubject3LeadVehicle(v, traffic)
          : undefined
      const oncomingVehicle =
        activeExamId === 'subject3' && traffic
          ? observeSubject3OncomingVehicle(v, traffic)
          : undefined
      const cutInHazard =
        activeExamId === 'subject3' && traffic
          ? observeSubject3CutInHazard(v, traffic)
          : undefined
      trajectory.current.push({
        t: (now - sessionStartedAt.current) / 1000,
        x: replayVehicle.x,
        z: replayVehicle.z,
        speed: v.speed,
        gear: v.gear,
        heading: replayVehicle.heading,
        project: replayProjectId,
        steeringWheelAngle: v.steeringWheelAngle,
        leftIndicator: v.leftIndicator || v.hazard,
        rightIndicator: v.rightIndicator || v.hazard,
        handbrake: v.handbrake,
        automatic,
        engineOn: v.engineOn,
        engineRpm: v.engineRpm,
        clutch: v.clutch,
        throttle: v.throttle,
        brake: v.brake,
        night: session.time === 'night',
        lowBeam: v.lowBeam,
        highBeam: v.highBeam,
        leadVehicleId: leadVehicle?.vehicleId,
        leadScenario: leadVehicle?.scenario,
        leadSpeedMps: leadVehicle?.leadSpeedMps,
        leadGapMeters: leadVehicle?.bumperGapMeters,
        leadTimeGapSeconds: leadVehicle?.timeGapSeconds,
        leadClosingSpeedMps: leadVehicle?.closingSpeedMps,
        leadTimeToCollisionSeconds: leadVehicle?.timeToCollisionSeconds,
        oncomingVehicleId: oncomingVehicle?.vehicleId,
        oncomingDistanceMeters: oncomingVehicle?.centerDistanceMeters,
        oncomingTimeToMeetSeconds: oncomingVehicle?.timeToMeetSeconds,
        cutInHazardId: cutInHazard?.hazardId,
        cutInConflict: cutInHazard?.conflict,
        cutInProgressDeltaMeters: cutInHazard?.progressDeltaMeters,
        cutInLateralDeltaMeters: cutInHazard?.lateralDeltaMeters,
        cutInLongitudinalSpeedMps: cutInHazard?.longitudinalSpeedMps,
        cutInLateralSpeedMps: cutInHazard?.lateralSpeedMps,
        cutInClosingSpeedMps: cutInHazard?.closingSpeedMps,
        cutInTimeToLongitudinalMeetSeconds:
          cutInHazard?.timeToLongitudinalMeetSeconds,
      })
    }
  }
  const score = Math.max(0, 100 - infractions.reduce((s, i) => s + i.points, 0))
  const finishSession = useCallback(() => {
    if (finishLatched.current) return
    finishLatched.current = true
    onDone(score, infractions, trajectory.current, sessionComplete)
  }, [infractions, onDone, score, sessionComplete])
  const activeEntryDistance = combinedExam
    ? subject2ExamDistanceToStart(activeExamId as Subject2ProjectId, display)
    : 0
  const navigatingToProject = combinedExam && !activeEntryReached
  const hudProjectStatus = navigatingToProject
    ? `连接道路 · 前往${examTitle(activeExamId)} · 距入口约 ${Math.max(1, Math.ceil(activeEntryDistance))} m`
    : projectStatus

  useEffect(() => {
    if (!combinedExam || activeEntryReached) return
    if (activeEntryDistance <= 6) setProgress(current => enterExamProject(current, activeExamId))
  }, [activeEntryDistance, activeEntryReached, activeExamId, combinedExam])

  useEffect(() => {
    if (session.mode !== 'exam' || finishLatched.current || infractions.length === 0) return
    const passLine = passLineForExam(activeExamId)
    if (infractions.some(i => i.fatal) || score < passLine) finishSession()
  }, [activeExamId, infractions, finishSession, score, session.mode])

  useEffect(() => {
    if (activeExamId !== 'subject3' || !lightTestDone || !projectStatus || typeof window === 'undefined' || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(projectStatus.replace(/ · /g, '。'))
    utterance.lang = 'zh-CN'
    utterance.rate = 1
    utterance.volume = 0.85
    window.speechSynthesis.speak(utterance)
    return () => window.speechSynthesis.cancel()
  }, [activeExamId, lightTestDone, projectStatus])

  useEffect(() => {
    if (activeExamId !== 'subject3' || !projectComplete || finishLatched.current) return
    finishSession()
  }, [activeExamId, finishSession, projectComplete])

  useEffect(() => {
    if (!trainingPack || activeExamId === 'subject3' || !projectComplete || finishLatched.current) return
    finishSession()
  }, [activeExamId, finishSession, projectComplete, trainingPack])

  useEffect(() => {
    if (!combinedExam || !projectComplete || finishLatched.current) return
    if (infractions.some(item => item.fatal) || score < 80) return
    if (activeIndex >= examSequence.length - 1) {
      finishSession()
      return
    }
    setProgress(current => advanceExamProgress(current, examSequence))
  }, [activeIndex, combinedExam, examSequence, infractions, finishSession, projectComplete, score])

  if (!webglAvailable || rendererFailed) return <div className="driving-shell webgl-fallback">
    <section className="webgl-fallback-card" role="alert">
      <div className="eyebrow">3D RENDERER UNAVAILABLE</div>
      <h1>{rendererFailed ? '3D 渲染器初始化失败' : '当前浏览器无法启动 3D 驾驶场景'}</h1>
      <p>{rendererFailed
        ? 'WebGL2 预检已通过，但 Three.js 未能创建渲染器。请尝试开启硬件加速、更新显卡驱动，或退出受限的远程/企业图形环境后重试。'
        : '未能创建 WebGL2 图形上下文。请确认浏览器支持 WebGL2，并尝试开启硬件加速或解除企业/远程环境的图形限制。'}</p>
      <div className="webgl-fallback-actions">
        <button className="ghost-btn" onClick={() => {
          setRendererFailed(false)
          setWebglAvailable(supportsWebGL2())
        }}>重新检测</button>
        <button className="primary" onClick={onExit}>返回训练中心</button>
      </div>
      <small>不会记录成绩，也不会把本次启动失败计为考试未完成。</small>
    </section>
  </div>

  return <div
    className="driving-shell"
    aria-busy={!drivingReady}
    onPointerDown={event => {
      if (event.target instanceof HTMLCanvasElement) {
        const canvas = event.target
        const active = document.activeElement
        if (active instanceof HTMLElement && active !== canvas) active.blur()
        canvas.tabIndex = -1
        canvas.focus({ preventScroll: true })
      }
    }}
  >
    <DrivingCanvasBoundary onError={() => setRendererFailed(true)}>
      <Canvas camera={{ fov: 68, near: .05, far: 500 }} shadows={{ type: THREE.PCFSoftShadowMap }}><DrivingWorld vehicle={vehicle} session={effectiveSession} automatic={automatic} continuousExam={combinedExam} projectJudgingEnabled={subject2ProjectJudgingEnabled(combinedExam, activeEntryReached)} controlsLocked={!lightTestDone} cameraMode={cameraMode} onCycleCameraMode={cycleCameraMode} onToggleHelp={toggleHelp} onReady={markDrivingReady} onInfraction={addInfraction} onIncident={addIncident} onTick={tick} onProjectStatus={setProjectStatus} onProjectComplete={() => setProgress(current => completeExamProject(current, activeExamId))} /><DrivingRendererLifecycle /></Canvas>
    </DrivingCanvasBoundary>
    {!drivingReady && <div className="driving-loading" role="status">正在加载驾驶场景…</div>}
    <div className="hud">
      <div className="hud-top">
        <div className="status-chip">{candidate.name} · {combinedExam
          ? `科目二模拟考试 ${activeIndex + 1}/${examSequence.length} · ${examTitle(activeExamId)}`
          : trainingPack && session.trainingPack
            ? `专项训练 · ${trainingPack.title} ${session.trainingPack.index + 1}/${trainingPack.stages.length} · ${trainingPackStageLabel(session.trainingPack)}`
            : session.subject3Practice
              ? sessionTitle(session)
              : session.mode === 'exam' ? '模拟考试' : '训练'} · {session.time === 'night' ? '夜间' : '白天'}</div>
        <div className="hud-actions">
          <button className="view-btn" onClick={cycleCameraMode}>
            M · {cameraMode === 'first' ? '第一人称' : cameraMode === 'second' ? '第二人称' : cameraMode === 'third' ? '第三人称' : '垂直俯视'}
          </button>
          <button className="finish-btn" onClick={finishSession}>结束并查看结果</button>
        </div>
      </div>
      {activeExamId === 'subject3' && !lightTestDone && <NightLightTest
        vehicle={vehicle}
        onPass={() => setLightTestDone(true)}
        onFail={(prompt) => {
          addInfraction(subject3Infraction(
            'subject3-light-test',
            `模拟夜间灯光考试操作错误：${prompt}`,
            'lightTest',
          ))
          setLightTestDone(true)
        }}
      />}
      {hudProjectStatus && <div className={`project-status${navigatingToProject ? ' route-status' : ''}`}>{hudProjectStatus}</div>}
      <DrivingHelp automatic={automatic} expanded={helpExpanded} onToggle={toggleHelp} />
      <div className="steering-hud" aria-label="方向盘位置">
        <div className="steering-hud-ring">
          <div className="steering-hud-rotor" style={{ transform: `rotate(${display.steeringWheelAngle}rad)` }}>
            <span className="steering-hud-center" />
            <span className="steering-hud-spoke s1" />
            <span className="steering-hud-spoke s2" />
            <span className="steering-hud-spoke s3" />
            <span className="steering-hud-mark" />
          </div>
        </div>
        <b>{Math.abs(display.steeringWheelAngle) < 0.03 ? '方向盘正' : `${display.steeringWheelAngle < 0 ? '左' : '右'} ${(Math.abs(display.steeringWheelAngle) / (Math.PI * 2)).toFixed(2)} 圈`}</b>
      </div>
      <div className="cluster">
        <div className="speed"><strong>{Math.round(Math.abs(display.speed) * 3.6)}</strong><span>公里/时</span></div>
        <div className="gear">{display.gear === -1 ? '倒挡' : display.gear === 0 ? '空挡' : automatic ? '前进' : `${display.gear} 挡`}</div>
        <PedalReadout automatic={automatic} throttle={display.throttle} brake={display.brake} clutch={display.clutch} />
        <div className="lamps"><span className={display.engineOn ? 'on' : ''}>{display.engineOn ? '发动机运行' : '发动机关闭'}</span><span className={display.handbrake ? 'warn' : ''}>{display.handbrake ? '手刹拉起' : '手刹放下'}</span>{!automatic && <span className={display.biteLatched ? 'on' : ''}>{display.biteLatched ? '半联动保持' : '离合结合'}</span>}<span className={display.leftIndicator || display.hazard ? 'turn' : ''}>◀</span><span className={display.lowBeam ? 'on' : ''}>近</span><span className={display.highBeam ? 'on' : ''}>远</span><span className={display.horn ? 'warn' : ''}>喇叭</span><span className={display.seatbelt ? 'on' : 'warn'}>{display.seatbelt ? '安全带已系' : '安全带未系'}</span><span className={display.rightIndicator || display.hazard ? 'turn' : ''}>▶</span></div>
      </div>
      {infractions.length > 0 && <div className="penalty-toast" role="status">{infractions[infractions.length - 1].title} · 已记录 {infractions.length} 项 · 当前 {score} 分</div>}
    </div>
  </div>
}

function Result({
  candidate,
  session,
  score,
  infractions,
  incidents,
  trajectory,
  completed,
  onBack,
  onStartTraining,
  onStartTrainingPack,
  onStartSubject3Practice,
  onContinueTrainingPack,
  onRetryTrainingPackStage,
  trainingPackStages,
}: {
  candidate: Candidate
  session: Session
  score: number
  infractions: Infraction[]
  incidents: DrivingIncident[]
  trajectory: TrajectorySample[]
  completed: boolean
  onBack: () => void
  onStartTraining: (examId: ReplayTrainingProjectId) => void
  onStartTrainingPack: (packId: TrainingPackId) => void
  onStartSubject3Practice: (slice: Subject3PracticeSliceId) => void
  onContinueTrainingPack: (state: TrainingPackSessionState) => void
  onRetryTrainingPackStage: (state: TrainingPackSessionState) => void
  trainingPackStages: readonly TrainingPackStageResult[]
}) {
  const { passLine, passed, status } = assessSessionResult({ examId: session.examId, score, completed, infractions })
  const trainingPack = session.trainingPack ? trainingPackById(session.trainingPack.id) : null
  const nextPackState = session.trainingPack ? nextTrainingPackState(session.trainingPack) : null
  const resultLabel = status === 'incomplete'
    ? '未完成'
    : passed
      ? trainingPack ? '达标' : '合格'
      : trainingPack ? '需继续练习' : '未合格'
  const resultComment = buildResultComment({
    examTitle: sessionTitle(session),
    score,
    passLine,
    status,
    resultLabel,
    infractionTitles: infractions.map(item => item.title),
    incidents,
    fatalCount: infractions.filter(item => item.fatal).length,
  })
  const [shareState, setShareState] = useState<'idle' | 'shared' | 'copied'>('idle')
  const shareResult = useCallback(async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: '驾考模拟成绩', text: resultComment.shareText })
        setShareState('shared')
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(resultComment.shareText)
      setShareState('copied')
    }
  }, [resultComment.shareText])

  return <main className="shell centered"><section className="result-card">
    <div className="eyebrow">{trainingPack ? '专项训练阶段结果' : '模拟考试成绩单'}</div><div className={'result-mark ' + (passed ? 'passed' : 'failed')}><strong>{score}</strong><span>{resultLabel}</span></div>
    {status === 'incomplete' && <p className="disclaimer">本次提前结束，尚未完成全部要求。分数仅代表已记录的操作，不作为合格成绩。</p>}
    <h1>{candidate.name}</h1><div className="result-meta"><span>{candidate.licenseType}</span><span>{sessionTitle(session)}</span><span>合格线 {passLine}</span></div>
    <section className={'result-comment ' + status} aria-label="今日车评">
      <div className="result-comment-topline"><span>今日车评</span><b>{resultComment.badge}</b></div>
      <blockquote>{resultComment.headline}</blockquote>
      <p>{resultComment.detail}</p>
      <button className="result-share-btn" type="button" onClick={shareResult}>
        {shareState === 'copied' ? '已复制 · 去分享' : shareState === 'shared' ? '已分享' : '分享这次成绩'}
      </button>
    </section>
    {incidents.length > 0 && <div className="result-incidents" aria-label="现场记录">
      <strong>现场记录 · 不计分</strong>
      <span>{incidents.map(item => item.title).join(' · ')}</span>
    </div>}

    {trainingPack && session.trainingPack && <section className="training-pack-progress" aria-label="专项训练进度">
      <div className="training-pack-progress-head">
        <div><span>专项训练包</span><strong>{trainingPack.title}</strong></div>
        <b>{session.trainingPack.index + 1} / {trainingPack.stages.length}</b>
      </div>
      <p>{trainingPack.summary}</p>
      <div className="training-pack-steps">
        {trainingPack.stages.map((stage, index) => <span
          key={stage.label + '-' + index}
          className={index < session.trainingPack!.index ? 'done' : index === session.trainingPack!.index ? 'active' : ''}
        >
          <i>{index + 1}</i>{stage.label}
        </span>)}
      </div>
    </section>}

    {trainingPack && session.trainingPack && !nextPackState && <TrainingPackReport
      packId={session.trainingPack.id}
      stages={trainingPackStages}
      candidateName={candidate.name}
      licenseType={candidate.licenseType}
      onRestart={onStartTrainingPack}
      onRetryStage={onRetryTrainingPackStage}
    />}

    <div className="infractions"><h3>评判记录</h3>{infractions.length === 0 ? <p>本次没有记录到扣分事件。</p> : infractions.map(i => <div key={i.id}><span>{i.title}</span><b>{i.fatal ? '不合格' : `-${i.points}`}</b></div>)}</div>
    <ExamReplay
      samples={trajectory}
      infractions={infractions}
      onStartTraining={onStartTraining}
      onStartTrainingPack={onStartTrainingPack}
      onStartSubject3Practice={onStartSubject3Practice}
    />

    {trainingPack && nextPackState
      ? <div className="training-pack-result-actions">
          <button className="primary" onClick={() => onContinueTrainingPack(nextPackState)}>
            继续下一项 · {trainingPackStageLabel(nextPackState)}
          </button>
          <button className="ghost-btn" onClick={onBack}>结束训练包</button>
        </div>
      : trainingPack
        ? <button className="primary" onClick={onBack}>训练包完成 · 返回训练中心</button>
        : <button className="primary" onClick={onBack}>返回训练中心</button>}
    <p className="disclaimer">成绩仅用于模拟训练，不具有真实机动车驾驶人考试效力。</p>
  </section></main>
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('profile')
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [result, setResult] = useState<{ score: number, infractions: Infraction[], trajectory: TrajectorySample[], completed: boolean } | null>(null)
  const [sessionIncidents, setSessionIncidents] = useState<DrivingIncident[]>([])
  const [trainingPackStages, setTrainingPackStages] = useState<TrainingPackStageResult[]>([])
  const startSession = useCallback((nextSession: Session) => {
    if (!nextSession.trainingPack) setTrainingPackStages([])
    setSession(nextSession)
    setResult(null)
    setSessionIncidents([])
    setPhase('driving')
  }, [])
  const startTrainingPack = useCallback((id: TrainingPackId, time: TimeOfDay) => {
    setTrainingPackStages([])
    startSession(createTrainingPackSession(id, time))
  }, [startSession])

  if (phase === 'profile') return <Profile onSubmit={c => { setCandidate(c); setPhase('menu') }} />
  if (!candidate) return null
  if (phase === 'menu') return <Menu
    candidate={candidate}
    onStart={startSession}
    onStartTrainingPack={startTrainingPack}
    onSwitchCandidate={() => {
      setTrainingPackStages([])
      setPhase('profile')
    }}
  />
  if (phase === 'driving' && session) return <Driving
    candidate={candidate}
    session={session}
    onExit={() => setPhase('menu')}
    onIncident={incident => setSessionIncidents(prev =>
      prev.some(item => item.id === incident.id) ? prev : [...prev, incident]
    )}
    onDone={(score, infractions, trajectory, completed) => {
    const outcome = assessSessionResult({ examId: session.examId, score, completed, infractions })
    appendExamHistory({
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      createdAt: Date.now(),
      candidateName: candidate.name,
      licenseType: candidate.licenseType,
      examId: session.examId,
      subject3Practice: session.subject3Practice,
      mode: session.mode,
      score,
      passed: outcome.passed,
      status: outcome.status,
      completed,
      infractionCount: infractions.length,
    })
    if (session.trainingPack) {
      const stageResult: TrainingPackStageResult = {
        packId: session.trainingPack.id,
        index: session.trainingPack.index,
        project: session.examId as ReplayTrainingProjectId,
        score,
        completed,
        passed: outcome.passed,
        infractions: infractions.map(item => ({
          id: item.id,
          title: item.title,
          points: item.points,
          fatal: item.fatal,
        })),
      }
      const nextStages = [
        ...trainingPackStages.filter(item => !(
          item.packId === stageResult.packId &&
          item.index === stageResult.index
        )),
        stageResult,
      ].sort((a, b) => a.index - b.index)
      setTrainingPackStages(nextStages)

      const pack = trainingPackById(session.trainingPack.id)
      const reachedLastStage = session.trainingPack.index === pack.stages.length - 1
      const hasEveryStage = nextStages.length === pack.stages.length
      if (reachedLastStage && hasEveryStage) {
        appendTrainingPackHistory(buildTrainingPackHistoryEntry({
          id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `pack-${Date.now()}-${Math.random()}`,
          createdAt: Date.now(),
          candidateName: candidate.name,
          licenseType: candidate.licenseType,
          packId: session.trainingPack.id,
          stages: nextStages,
        }))
      }
    }
    setResult({ score, infractions, trajectory: [...trajectory], completed })
    setPhase('result')
  }}
  />
  if (phase === 'result' && session && result) return <Result
    candidate={candidate}
    session={session}
    score={result.score}
    infractions={result.infractions}
    incidents={sessionIncidents}
    trajectory={result.trajectory}
    completed={result.completed}
    onBack={() => {
      setTrainingPackStages([])
      setPhase('menu')
    }}
    onStartTraining={examId => startSession({
      examId,
      mode: 'practice',
      time: session.time,
    })}
    onStartTrainingPack={packId => startTrainingPack(packId, session.time)}
    onStartSubject3Practice={subject3Practice => startSession({
      examId: 'subject3',
      mode: 'practice',
      time: session.time,
      subject3Practice,
    })}
    onContinueTrainingPack={trainingPack => {
      const stage = trainingPackStage(trainingPack)
      startSession({
        examId: stage.project as ExamId,
        mode: 'practice',
        time: session.time,
        trainingPack,
        subject3Practice: stage.subject3Practice,
      })
    }}
    onRetryTrainingPackStage={trainingPack => {
      const stage = trainingPackStage(trainingPack)
      startSession({
        examId: stage.project as ExamId,
        mode: 'practice',
        time: session.time,
        subject3Practice: stage.subject3Practice,
      })
    }}
    trainingPackStages={trainingPackStages}
  />
  return null
}

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { ReverseParkingCourse, createReverseParkingRuntime, updateReverseParking } from './subject2/ReverseParkingCourse'
import { SideParkingCourse, createSideParkingRuntime, updateSideParking } from './subject2/SideParkingCourse'
import { RightAngleCourse, createRightAngleRuntime, updateRightAngle } from './subject2/RightAngleCourse'
import { CurveDrivingCourse, CURVE_START, createCurveRuntime, updateCurveDriving } from './subject2/CurveDrivingCourse'
import { SlopeStartCourse, createSlopeRuntime, getSlopePose, updateSlopeStart } from './subject2/SlopeStartCourse'
import { DrivingCockpit } from './cockpit/DrivingCockpit'
import { Subject3Course, SUBJECT3_START, createSubject3Runtime, updateSubject3 } from './subject3/Subject3Course'
import { NightLightTest } from './subject3/NightLightTest'
import { DRIVING_RULES } from './rules/drivingRules'
import { stepVehiclePhysics } from './sim/vehiclePhysics'
import { ExamReplay, type TrajectorySample } from './replay/ExamReplay'
import { appendExamHistory, loadCandidate, loadExamHistory, saveCandidate } from './storage/profileStorage'
import { RacingWheelSetup } from './input/RacingWheelSetup'
import { readRacingWheelControls } from './input/racingWheel'

type Gender = '男' | '女' | '其他'
type LicenseType = 'C1' | 'C2'
type Phase = 'profile' | 'menu' | 'driving' | 'result'
type ExamId = 'reverse-parking' | 'side-parking' | 'slope-start' | 'curve-driving' | 'right-angle' | 'subject2-exam' | 'subject3'
type Mode = 'practice' | 'exam'
type TimeOfDay = 'day' | 'night'

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

const initialProjectStatus = (examId: ExamId) => {
  if (examId === 'reverse-parking') return '驶过右侧控制线后停车，挂 R 挡开始第一次倒库'
  if (examId === 'side-parking') return '向前驶过库位，调整车身与右侧边线距离，准备挂 R 挡'
  if (examId === 'right-angle') return '进入直角转弯前开启左转向灯，控制车身靠右低速行驶'
  if (examId === 'curve-driving') return '曲线行驶：一挡低速前进进入 S 弯，保持车轮不触轧两侧边线'
  if (examId === 'slope-start') return '坡道定点停车：保持右侧车身距边线 30cm 内，将前保险杠停在桩杆线上'
  if (examId === 'subject3') return '科目三道路驾驶 · 请完成上车准备，系好安全带，开启左转向灯后安全起步'
  return ''
}

const initialVehicle = (examId?: ExamId): Vehicle => {
  const reverseParking = examId === 'reverse-parking'
  const sideParking = examId === 'side-parking'
  const rightAngle = examId === 'right-angle'
  const curveDriving = examId === 'curve-driving'
  const slopeStart = examId === 'slope-start'
  const subject3 = examId === 'subject3'
  return {
    x: curveDriving ? CURVE_START.x : slopeStart ? 0.4 : subject3 ? SUBJECT3_START.x : 0,
    z: reverseParking ? 5.7 : sideParking ? 8.2 : rightAngle ? 7.2 : curveDriving ? CURVE_START.z : slopeStart ? 11 : subject3 ? SUBJECT3_START.z : 8,
    heading: reverseParking ? Math.PI : 0,
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
  }
}

function Profile({ onSubmit }: { onSubmit: (candidate: Candidate) => void }) {
  const savedCandidate = useMemo(() => loadCandidate(), [])
  const [name, setName] = useState(savedCandidate?.name ?? '')
  const [gender, setGender] = useState<Gender>(savedCandidate?.gender ?? '男')
  const [age, setAge] = useState(savedCandidate?.age ?? 18)
  const [licenseType, setLicenseType] = useState<LicenseType>(savedCandidate?.licenseType ?? 'C1')
  return <main className="shell centered"><section className="hero-card">
    <div className="eyebrow">SUBJECT2 · 中国大陆驾考 3D 模拟训练</div>
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

function Menu({ candidate, onStart, onSwitchCandidate }: { candidate: Candidate, onStart: (s: Session) => void, onSwitchCandidate: () => void }) {
  const [mode, setMode] = useState<Mode>('practice')
  const [time, setTime] = useState<TimeOfDay>('day')
  const visible = projects.filter(p => !(candidate.licenseType === 'C2' && p[0] === 'slope-start'))
  const recentHistory = useMemo(
    () => loadExamHistory().filter(item => item.candidateName === candidate.name).slice(0, 4),
    [candidate.name],
  )
  return <main className="shell menu-shell">
    <header className="topbar"><div><div className="eyebrow">SUBJECT2 DRIVING LAB</div><h1>{candidate.name}，选择训练任务</h1></div><div className="candidate-actions"><div className="candidate-pill">{candidate.licenseType} · {candidate.gender} · {candidate.age} 岁</div><button className="ghost-btn" onClick={onSwitchCandidate}>切换考生</button></div></header>
    <section className="toolbar">
      <div className="segmented"><button className={mode === 'practice' ? 'active' : ''} onClick={() => setMode('practice')}>训练模式</button><button className={mode === 'exam' ? 'active' : ''} onClick={() => setMode('exam')}>考试模式</button></div>
      <div className="segmented"><button className={time === 'day' ? 'active' : ''} onClick={() => setTime('day')}>白天</button><button className={time === 'night' ? 'active' : ''} onClick={() => setTime('night')}>夜间</button></div>
    </section>
    <RacingWheelSetup />
    {recentHistory.length > 0 && <section className="recent-results">
      <div className="recent-results-head"><div><span className="chapter">最近记录</span><h3>本地训练成绩</h3></div><span>仅保存在当前浏览器</span></div>
      <div className="recent-results-grid">
        {recentHistory.map(item => <div className="recent-result" key={item.id}>
          <div><strong>{examTitle(item.examId as ExamId)}</strong><span>{item.mode === 'exam' ? '模拟考试' : '训练'} · {new Date(item.createdAt).toLocaleDateString()}</span></div>
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
    </section>
    <aside className="legal-note">规则基线按现行中国大陆机动车驾驶人考试规范建模；实际考场路线、检测设备和地方执行细节可能不同。本项目用于模拟训练，不替代当地主管部门要求。</aside>
  </main>
}

function Road() {
  const dashes = useMemo(() => Array.from({ length: 90 }, (_, i) => 25 - i * 5), [])
  const trees = useMemo(() => Array.from({ length: 48 }, (_, i) => ({ side: i % 2 ? 1 : -1, z: 18 - Math.floor(i / 2) * 17, offset: (i % 5) * .6 })), [])
  return <group>
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.025, -185]}><planeGeometry args={[18, 440]} /><meshStandardMaterial color="#3b4044" roughness={1} /></mesh>
    {[-9, 9].map(x => <mesh key={x} rotation-x={-Math.PI / 2} position={[x, -0.012, -185]}><planeGeometry args={[.16, 440]} /><meshBasicMaterial color="#f5f5e8" /></mesh>)}
    {dashes.map(z => <mesh key={z} rotation-x={-Math.PI / 2} position={[0, -.011, z]}><planeGeometry args={[.12, 2.5]} /><meshBasicMaterial color="#e8e5cf" /></mesh>)}
    <group position={[0, .002, -42]}>
      {Array.from({ length: 7 }, (_, i) => <mesh key={i} rotation-x={-Math.PI / 2} position={[-6 + i * 2, 0, 0]}><planeGeometry args={[1, 4]} /><meshBasicMaterial color="#fafafa" /></mesh>)}
    </group>
    {trees.map((t, i) => <group key={i} position={[t.side * (12 + t.offset), 0, t.z]}>
      <mesh position={[0, 1.1, 0]}><cylinderGeometry args={[.15, .2, 2.2, 8]} /><meshStandardMaterial color="#5f5140" /></mesh>
      <mesh position={[0, 3, 0]}><sphereGeometry args={[1.25, 12, 8]} /><meshStandardMaterial color="#3d6545" /></mesh>
    </group>)}
    <group position={[-7, 0, -29]}><mesh position={[0, 1.6, 0]}><cylinderGeometry args={[.08, .08, 3.2, 8]} /><meshStandardMaterial color="#777" /></mesh><mesh position={[0, 3.1, 0]}><boxGeometry args={[1.2, 1.2, .08]} /><meshStandardMaterial color="#1766a3" /></mesh></group>
  </group>
}

function DrivingWorld({ vehicle, session, automatic, controlsLocked, onInfraction, onTick, onProjectStatus, onProjectComplete }: {
  vehicle: React.MutableRefObject<Vehicle>, session: Session, automatic: boolean, controlsLocked: boolean,
  onInfraction: (i: Infraction) => void, onTick: () => void,
  onProjectStatus: (status: string) => void,
  onProjectComplete: () => void
}) {
  const keys = useRef<Record<string, boolean>>({})
  const cameraYaw = useRef(0)
  const { camera } = useThree()
  const speedTimer = useRef(0)
  const reverseParkingRuntime = useRef(createReverseParkingRuntime())
  const sideParkingRuntime = useRef(createSideParkingRuntime())
  const rightAngleRuntime = useRef(createRightAngleRuntime())
  const curveRuntime = useRef(createCurveRuntime())
  const slopeRuntime = useRef(createSlopeRuntime())
  const subject3Runtime = useRef(createSubject3Runtime())
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
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      keys.current[k] = true
      const v = vehicle.current
      if (e.code === 'Space') { e.preventDefault(); v.handbrake = !v.handbrake }
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
      if (k === 'n') v.gear = 0
      if (k === 'r') v.gear = -1
      if (automatic && k === 'g') v.gear = 1
      if (!automatic && /^[1-5]$/.test(k)) v.gear = Number(k)
      if (k === 'b') { v.horn = true; startHorn() }
      if (k === 't') v.seatbelt = !v.seatbelt
      if (k === 'z') { cameraYaw.current = .62; v.lookLeft = true }
      if (k === 'x') { cameraYaw.current = -.62; v.lookRight = true }
      if (k === 'f') { cameraYaw.current = Math.PI; v.lookBack = true }
    }
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      keys.current[k] = false
      if (['z','x','f'].includes(k)) cameraYaw.current = 0
      if (k === 'z') vehicle.current.lookLeft = false
      if (k === 'x') vehicle.current.lookRight = false
      if (k === 'f') vehicle.current.lookBack = false
      if (k === 'b') { vehicle.current.horn = false; stopHorn() }
    }
    addEventListener('keydown', down); addEventListener('keyup', up)
    return () => {
      removeEventListener('keydown', down)
      removeEventListener('keyup', up)
      stopHorn()
      void audioContext.current?.close()
      audioContext.current = null
    }
  }, [automatic, vehicle])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, .05)
    const v = vehicle.current
    const wheel = readRacingWheelControls()
    const keyboardThrottle = keys.current['w'] || keys.current['arrowup'] ? 1 : 0
    const keyboardBrake = keys.current['s'] || keys.current['arrowdown'] ? 1 : 0
    const keyboardClutch = automatic
      ? 0
      : keys.current['c']
        ? 1
        : keys.current['shift']
          ? DRIVING_RULES.manualTransmission.biteClutchPosition
          : 0
    const keyboardSteer = (keys.current['d'] || keys.current['arrowright'] ? 1 : 0) - (keys.current['a'] || keys.current['arrowleft'] ? 1 : 0)

    const throttle = controlsLocked ? 0 : wheel.deviceId ? wheel.throttle : keyboardThrottle
    const brake = controlsLocked ? 0 : wheel.deviceId ? wheel.brake : keyboardBrake
    const clutch = controlsLocked || automatic
      ? 0
      : wheel.deviceId && wheel.clutch != null
        ? wheel.clutch
        : keyboardClutch
    const steer = controlsLocked || wheel.deviceId ? 0 : keyboardSteer
    const slopeBeforeStep = session.examId === 'slope-start' ? getSlopePose(v.z) : { y: 0, pitch: 0, grade: 0 }
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
    })
    if (physics.stalled) {
      stallCount.current += 1
      onInfraction({
        id: `engine-stall-${stallCount.current}`,
        title: '因操作不当造成发动机熄火',
        points: 10,
      })
    }
    v.leftSignalAge = v.leftIndicator ? v.leftSignalAge + dt : 0
    v.rightSignalAge = v.rightIndicator ? v.rightSignalAge + dt : 0

    const roadPose = session.examId === 'slope-start' ? getSlopePose(v.z) : { y: 0, pitch: 0, grade: 0 }
    if (carGroup.current) {
      carGroup.current.position.set(v.x, roadPose.y, v.z)
      carGroup.current.rotation.set(roadPose.pitch, -v.heading, 0)
    }
    const driverOffsetX = -0.4
    const driverForward = 0.1
    camera.position.set(
      v.x + Math.cos(v.heading) * driverOffsetX + Math.sin(v.heading) * driverForward,
      roadPose.y + 1.49,
      v.z + Math.sin(v.heading) * driverOffsetX - Math.cos(v.heading) * driverForward,
    )
    camera.rotation.set(roadPose.pitch, -v.heading + cameraYaw.current, 0)

    const limit = session.examId === 'subject3' ? 50 : 12
    if (Math.abs(v.speed) * 3.6 > limit) {
      speedTimer.current += dt
      if (speedTimer.current > 1.2) onInfraction({ id: 'speed-control', title: '训练区域速度控制不当', points: 10 })
    } else speedTimer.current = 0
    if (session.mode === 'exam' && Math.abs(v.speed) > .25 && v.handbrake) onInfraction({ id: 'parking-brake', title: '未松驻车制动器起步', points: 10 })
    if (Math.abs(v.speed) > .25 && !v.seatbelt) onInfraction({ id: 'seatbelt-not-fastened', title: '起步或行驶时未按规定使用安全带', points: 100, fatal: true })
    if (!['reverse-parking', 'side-parking', 'right-angle', 'curve-driving', 'slope-start', 'subject3'].includes(session.examId) && Math.abs(v.x) > 10.2) onInfraction({ id: 'road-boundary', title: '车辆驶出当前训练道路边界', points: 100, fatal: true })

    let projectUpdate: { status: string; infractions: Infraction[] } | null = null
    let projectCompleted = false
    if (session.examId === 'reverse-parking') {
      const update = updateReverseParking(v, reverseParkingRuntime.current, dt)
      reverseParkingRuntime.current = update.runtime
      projectUpdate = update
      projectCompleted = update.runtime.completed
    } else if (session.examId === 'side-parking') {
      const update = updateSideParking(v, sideParkingRuntime.current, dt)
      sideParkingRuntime.current = update.runtime
      projectUpdate = update
      projectCompleted = update.runtime.completed
    } else if (session.examId === 'right-angle') {
      const update = updateRightAngle(v, rightAngleRuntime.current, dt)
      rightAngleRuntime.current = update.runtime
      projectUpdate = update
      projectCompleted = update.runtime.completed
    } else if (session.examId === 'curve-driving') {
      const update = updateCurveDriving(v, curveRuntime.current, dt)
      curveRuntime.current = update.runtime
      projectUpdate = update
      projectCompleted = update.runtime.completed
    } else if (session.examId === 'slope-start') {
      const update = updateSlopeStart(v, slopeRuntime.current, dt)
      slopeRuntime.current = update.runtime
      projectUpdate = update
      projectCompleted = update.runtime.completed
    } else if (session.examId === 'subject3') {
      const update = updateSubject3(v, subject3Runtime.current, automatic, session.time === 'night', dt)
      subject3Runtime.current = update.runtime
      projectUpdate = update
      projectCompleted = update.runtime.completed
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

    onTick()
  })

  const night = session.time === 'night'
  return <>
    <color attach="background" args={[night ? '#07101d' : '#8fb8d2']} />
    <fog attach="fog" args={[night ? '#07101d' : '#b5cbd5', 38, 185]} />
    <ambientLight intensity={night ? .2 : 1.2} />
    <hemisphereLight intensity={night ? .12 : .65} groundColor="#59644f" />
    <directionalLight position={[25, 42, 18]} intensity={night ? .16 : 2.1} />
    {session.examId === 'reverse-parking' ? <ReverseParkingCourse /> : session.examId === 'side-parking' ? <SideParkingCourse /> : session.examId === 'right-angle' ? <RightAngleCourse /> : session.examId === 'curve-driving' ? <CurveDrivingCourse /> : session.examId === 'slope-start' ? <SlopeStartCourse /> : session.examId === 'subject3' ? <Subject3Course player={vehicle} onInfraction={onInfraction} /> : <Road />}
    <group ref={carGroup}><DrivingCockpit vehicle={vehicle} showClutch={!automatic} automatic={automatic} /></group>
    <mesh rotation-x={-Math.PI / 2} position={[0, -.08, -185]}><planeGeometry args={[260, 500]} /><meshStandardMaterial color={night ? '#14201a' : '#657b59'} /></mesh>
  </>
}

function Driving({ session, candidate, onDone }: { session: Session, candidate: Candidate, onDone: (score: number, infractions: Infraction[], trajectory: TrajectorySample[]) => void }) {
  const combinedExam = session.examId === 'subject2-exam'
  const automatic = candidate.licenseType === 'C2'
  const examSequence: ExamId[] = candidate.licenseType === 'C1'
    ? ['reverse-parking', 'slope-start', 'side-parking', 'curve-driving', 'right-angle']
    : ['reverse-parking', 'side-parking', 'curve-driving', 'right-angle']
  const [activeExamId, setActiveExamId] = useState<ExamId>(combinedExam ? examSequence[0] : session.examId)
  const activeIndex = combinedExam ? examSequence.indexOf(activeExamId) : 0
  const effectiveSession: Session = { ...session, examId: activeExamId }
  const vehicle = useRef(initialVehicle(activeExamId))
  const [display, setDisplay] = useState(initialVehicle(activeExamId))
  const [infractions, setInfractions] = useState<Infraction[]>([])
  const [projectStatus, setProjectStatus] = useState(initialProjectStatus(activeExamId))
  const [projectComplete, setProjectComplete] = useState(false)
  const [lightTestDone, setLightTestDone] = useState(!(activeExamId === 'subject3' && session.time === 'day'))
  const finishLatched = useRef(false)
  const lastUi = useRef(0)
  const sessionStartedAt = useRef(performance.now())
  const lastTrajectorySampleAt = useRef(0)
  const trajectory = useRef<TrajectorySample[]>([])
  const addInfraction = (item: Infraction) => setInfractions(prev => {
    if (prev.some(x => x.id === item.id)) return prev
    const now = performance.now()
    return [...prev, {
      ...item,
      t: (now - sessionStartedAt.current) / 1000,
      x: vehicle.current.x,
      z: vehicle.current.z,
      project: activeExamId,
    }]
  })

  useEffect(() => {
    vehicle.current = initialVehicle(activeExamId)
    setDisplay(initialVehicle(activeExamId))
    setProjectStatus(initialProjectStatus(activeExamId))
    setProjectComplete(false)
    setLightTestDone(!(activeExamId === 'subject3' && session.time === 'day'))
  }, [activeExamId, session.time])

  const tick = () => {
    const now = performance.now()
    if (now - lastUi.current > 80) {
      lastUi.current = now
      setDisplay({ ...vehicle.current })
    }
    if (now - lastTrajectorySampleAt.current > 180) {
      lastTrajectorySampleAt.current = now
      const v = vehicle.current
      trajectory.current.push({
        t: (now - sessionStartedAt.current) / 1000,
        x: v.x,
        z: v.z,
        speed: v.speed,
        gear: v.gear,
        heading: v.heading,
        project: activeExamId,
      })
    }
  }
  const score = Math.max(0, 100 - infractions.reduce((s, i) => s + i.points, 0))

  useEffect(() => {
    if (session.mode !== 'exam' || finishLatched.current || infractions.length === 0) return
    const passLine = activeExamId === 'subject3' ? 90 : 80
    if (infractions.some(i => i.fatal) || score < passLine) {
      finishLatched.current = true
      onDone(score, infractions, trajectory.current)
    }
  }, [activeExamId, infractions, onDone, score, session.mode])

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
    finishLatched.current = true
    onDone(score, infractions, trajectory.current)
  }, [activeExamId, infractions, onDone, projectComplete, score])

  const continueCombinedExam = () => {
    if (!combinedExam) return
    if (activeIndex >= examSequence.length - 1) {
      finishLatched.current = true
      onDone(score, infractions, trajectory.current)
      return
    }
    setActiveExamId(examSequence[activeIndex + 1])
  }

  return <div className="driving-shell">
    <Canvas camera={{ fov: 68, near: .05, far: 500 }}><DrivingWorld key={activeExamId} vehicle={vehicle} session={effectiveSession} automatic={automatic} controlsLocked={!lightTestDone} onInfraction={addInfraction} onTick={tick} onProjectStatus={setProjectStatus} onProjectComplete={() => setProjectComplete(true)} /></Canvas>
    <div className="hud">
      <div className="hud-top"><div className="status-chip">{candidate.name} · {combinedExam ? `科目二模拟考试 ${activeIndex + 1}/${examSequence.length} · ${examTitle(activeExamId)}` : session.mode === 'exam' ? '模拟考试' : '训练'} · {session.time === 'night' ? '夜间' : '白天'}</div><button className="finish-btn" onClick={() => onDone(score, infractions, trajectory.current)}>结束并生成成绩</button></div>
      {activeExamId === 'subject3' && !lightTestDone && <NightLightTest vehicle={vehicle} onPass={() => setLightTestDone(true)} onFail={(prompt) => { addInfraction({ id: 'subject3-light-test', title: `模拟夜间灯光考试操作错误：${prompt}`, points: 100, fatal: true }); setLightTestDone(true) }} />}
      {projectStatus && <div className="project-status">{projectStatus}</div>}
      {combinedExam && projectComplete && <div className="project-transition"><div className="eyebrow">项目完成</div><h3>{examTitle(activeExamId)}</h3><p>{activeIndex < examSequence.length - 1 ? `当前总分 ${score}，准备进入下一项目：${examTitle(examSequence[activeIndex + 1])}` : `全部 ${examSequence.length} 个项目已完成，生成科目二成绩单。`}</p><button className="primary" onClick={continueCombinedExam}>{activeIndex < examSequence.length - 1 ? '进入下一项目' : '完成考试'}</button></div>}
      <div className="instruction-card"><b>键盘驾驶 · {automatic ? 'C2 自动挡' : 'C1 手动挡'}</b><span>W 油门 · S 刹车 · A/D 持续打轮，松开保持方向{automatic ? '' : ' · C 离合到底 · Shift 半联动'}</span><span>{automatic ? 'G 前进(D) · N 空挡 · R 倒挡' : '1–5 / N / R 挡位'} · Space 手刹 · I 点火</span><span>Q/E 转向灯 · V 双闪 · L 近光 · K 远光 · B 喇叭 · T 安全带</span><span>Z/X 左右观察 · F 回头观察</span></div>
      <div className="cluster"><div className="speed"><strong>{Math.round(Math.abs(display.speed) * 3.6)}</strong><span>km/h</span></div><div className="gear">{display.gear === -1 ? 'R' : display.gear === 0 ? 'N' : automatic ? 'D' : display.gear}</div><div className="steering-readout">{Math.abs(display.steeringWheelAngle) < 0.03 ? '方向盘 正' : `方向盘 ${display.steeringWheelAngle < 0 ? '左' : '右'} ${(Math.abs(display.steeringWheelAngle) / (Math.PI * 2)).toFixed(2)} 圈`}</div><div className="lamps"><span className={display.engineOn ? 'on' : ''}>ENGINE</span><span className={display.handbrake ? 'warn' : ''}>P</span><span className={display.leftIndicator || display.hazard ? 'turn' : ''}>◀</span><span className={display.lowBeam ? 'on' : ''}>近</span><span className={display.highBeam ? 'on' : ''}>远</span><span className={display.horn ? 'warn' : ''}>HORN</span><span className={display.seatbelt ? 'on' : 'warn'}>BELT</span><span className={display.rightIndicator || display.hazard ? 'turn' : ''}>▶</span></div></div>
      {infractions.length > 0 && <div className="penalty-toast">已记录 {infractions.length} 项 · 当前 {score} 分</div>}
    </div>
  </div>
}

function Result({ candidate, session, score, infractions, trajectory, onBack }: { candidate: Candidate, session: Session, score: number, infractions: Infraction[], trajectory: TrajectorySample[], onBack: () => void }) {
  const passLine = session.examId === 'subject3' ? 90 : 80
  const passed = score >= passLine && !infractions.some(i => i.fatal)
  return <main className="shell centered"><section className="result-card">
    <div className="eyebrow">模拟考试成绩单</div><div className={'result-mark ' + (passed ? 'passed' : 'failed')}><strong>{score}</strong><span>{passed ? '合格' : '未合格'}</span></div>
    <h1>{candidate.name}</h1><div className="result-meta"><span>{candidate.licenseType}</span><span>{session.examId}</span><span>合格线 {passLine}</span></div>
    <div className="infractions"><h3>评判记录</h3>{infractions.length === 0 ? <p>本次没有记录到扣分事件。</p> : infractions.map(i => <div key={i.id}><span>{i.title}</span><b>{i.fatal ? '不合格' : `-${i.points}`}</b></div>)}</div>
    <ExamReplay samples={trajectory} infractions={infractions} />
    <button className="primary" onClick={onBack}>返回训练中心</button><p className="disclaimer">成绩仅用于模拟训练，不具有真实机动车驾驶人考试效力。</p>
  </section></main>
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('profile')
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [result, setResult] = useState<{ score: number, infractions: Infraction[], trajectory: TrajectorySample[] } | null>(null)

  if (phase === 'profile') return <Profile onSubmit={c => { setCandidate(c); setPhase('menu') }} />
  if (!candidate) return null
  if (phase === 'menu') return <Menu candidate={candidate} onStart={s => { setSession(s); setResult(null); setPhase('driving') }} onSwitchCandidate={() => setPhase('profile')} />
  if (phase === 'driving' && session) return <Driving candidate={candidate} session={session} onDone={(score, infractions, trajectory) => {
    const passLine = session.examId === 'subject3' ? 90 : 80
    appendExamHistory({
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      createdAt: Date.now(),
      candidateName: candidate.name,
      licenseType: candidate.licenseType,
      examId: session.examId,
      mode: session.mode,
      score,
      passed: score >= passLine && !infractions.some(item => item.fatal),
      infractionCount: infractions.length,
    })
    setResult({ score, infractions, trajectory: [...trajectory] })
    setPhase('result')
  }} />
  if (phase === 'result' && session && result) return <Result candidate={candidate} session={session} score={result.score} infractions={result.infractions} trajectory={result.trajectory} onBack={() => setPhase('menu')} />
  return null
}

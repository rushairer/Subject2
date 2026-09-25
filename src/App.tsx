import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { ReverseParkingCourse, createReverseParkingRuntime, updateReverseParking } from './subject2/ReverseParkingCourse'
import { SideParkingCourse, createSideParkingRuntime, updateSideParking } from './subject2/SideParkingCourse'
import { RightAngleCourse, createRightAngleRuntime, updateRightAngle } from './subject2/RightAngleCourse'
import { CurveDrivingCourse, CURVE_START, createCurveRuntime, updateCurveDriving } from './subject2/CurveDrivingCourse'
import { SlopeStartCourse, createSlopeRuntime, getSlopePose, updateSlopeStart } from './subject2/SlopeStartCourse'
import { DrivingCockpit } from './cockpit/DrivingCockpit'

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
  throttle: number
  brake: number
  clutch: number
  gear: number
  engineOn: boolean
  handbrake: boolean
  leftIndicator: boolean
  rightIndicator: boolean
  hazard: boolean
  lowBeam: boolean
  highBeam: boolean
  horn: boolean
  seatbelt: boolean
}
interface Infraction {
  id: string
  title: string
  points: number
  fatal?: boolean
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
  return ''
}

const initialVehicle = (examId?: ExamId): Vehicle => {
  const reverseParking = examId === 'reverse-parking'
  const sideParking = examId === 'side-parking'
  const rightAngle = examId === 'right-angle'
  const curveDriving = examId === 'curve-driving'
  const slopeStart = examId === 'slope-start'
  return {
    x: curveDriving ? CURVE_START.x : slopeStart ? 0.4 : 0,
    z: reverseParking ? 5.7 : sideParking ? 8.2 : rightAngle ? 7.2 : curveDriving ? CURVE_START.z : slopeStart ? 11 : 8,
    heading: reverseParking ? Math.PI : 0,
    speed: 0,
    steering: 0,
    throttle: 0,
    brake: 0,
    clutch: 0,
    gear: 0,
    engineOn: false,
    handbrake: true,
    leftIndicator: false,
    rightIndicator: false,
    hazard: false,
    lowBeam: false,
    highBeam: false,
    horn: false,
    seatbelt: false,
  }
}

function Profile({ onSubmit }: { onSubmit: (candidate: Candidate) => void }) {
  const [name, setName] = useState('')
  const [gender, setGender] = useState<Gender>('男')
  const [age, setAge] = useState(18)
  const [licenseType, setLicenseType] = useState<LicenseType>('C1')
  return <main className="shell centered"><section className="hero-card">
    <div className="eyebrow">SUBJECT2 · 中国大陆驾考 3D 模拟训练</div>
    <h1>建立考生档案</h1>
    <p className="lead">档案用于当前浏览器内的训练与模拟考试成绩单。</p>
    <form className="profile-form" onSubmit={e => {
      e.preventDefault()
      if (name.trim()) onSubmit({ name: name.trim(), gender, age, licenseType })
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

function Menu({ candidate, onStart }: { candidate: Candidate, onStart: (s: Session) => void }) {
  const [mode, setMode] = useState<Mode>('practice')
  const [time, setTime] = useState<TimeOfDay>('day')
  const visible = projects.filter(p => !(candidate.licenseType === 'C2' && p[0] === 'slope-start'))
  return <main className="shell menu-shell">
    <header className="topbar"><div><div className="eyebrow">SUBJECT2 DRIVING LAB</div><h1>{candidate.name}，选择训练任务</h1></div><div className="candidate-pill">{candidate.licenseType} · {candidate.gender} · {candidate.age} 岁</div></header>
    <section className="toolbar">
      <div className="segmented"><button className={mode === 'practice' ? 'active' : ''} onClick={() => setMode('practice')}>训练模式</button><button className={mode === 'exam' ? 'active' : ''} onClick={() => setMode('exam')}>考试模式</button></div>
      <div className="segmented"><button className={time === 'day' ? 'active' : ''} onClick={() => setTime('day')}>白天</button><button className={time === 'night' ? 'active' : ''} onClick={() => setTime('night')}>夜间</button></div>
    </section>
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

function DrivingWorld({ vehicle, session, automatic, onInfraction, onTick, onProjectStatus, onProjectComplete }: {
  vehicle: React.MutableRefObject<Vehicle>, session: Session, automatic: boolean,
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
  const carGroup = useRef<THREE.Group>(null)
  const lastProjectStatus = useRef('')
  const completionLatched = useRef(false)
  const audioContext = useRef<AudioContext | null>(null)
  const hornNodes = useRef<{ oscillators: OscillatorNode[]; gain: GainNode } | null>(null)

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
      if (k === 'i') v.engineOn = !v.engineOn
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
      if (k === 'z') cameraYaw.current = -.62
      if (k === 'x') cameraYaw.current = .62
      if (k === 'f') cameraYaw.current = Math.PI
    }
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      keys.current[k] = false
      if (['z','x','f'].includes(k)) cameraYaw.current = 0
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
    const throttle = keys.current['w'] || keys.current['arrowup'] ? 1 : 0
    const brake = keys.current['s'] || keys.current['arrowdown'] ? 1 : 0
    const clutch = automatic ? 0 : (keys.current['c'] ? 1 : 0)
    const steer = (keys.current['d'] || keys.current['arrowright'] ? 1 : 0) - (keys.current['a'] || keys.current['arrowleft'] ? 1 : 0)
    v.throttle = throttle
    v.brake = brake
    v.clutch = clutch
    v.steering += (steer * .58 - v.steering) * Math.min(1, dt * 7)

    if (v.engineOn && !v.handbrake && v.gear !== 0) {
      const direction = v.gear < 0 ? -1 : 1
      const gearFactor = v.gear < 0 ? .48 : Math.max(.36, 1 - (v.gear - 1) * .1)
      v.speed += throttle * 5.2 * gearFactor * direction * (1 - clutch * .85) * dt
    }
    const braking = brake * 9 + (v.handbrake ? 12 : 0)
    if (Math.abs(v.speed) > .001) v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), braking * dt)
    if (session.examId === 'slope-start' && !v.handbrake && !brake) {
      const slope = getSlopePose(v.z)
      if (slope.grade > 0) v.speed -= Math.sin(slope.pitch) * 9.81 * dt
    }
    v.speed *= Math.pow(.987, dt * 60)
    v.speed = Math.max(-5.5, Math.min(16, v.speed))
    v.heading += v.steering * v.speed * dt * .055
    v.x += Math.sin(v.heading) * v.speed * dt
    v.z -= Math.cos(v.heading) * v.speed * dt

    const roadPose = session.examId === 'slope-start' ? getSlopePose(v.z) : { y: 0, pitch: 0, grade: 0 }
    if (carGroup.current) {
      carGroup.current.position.set(v.x, roadPose.y, v.z)
      carGroup.current.rotation.set(roadPose.pitch, v.heading, 0)
    }
    const driverOffsetX = -0.4
    const driverForward = 0.1
    camera.position.set(
      v.x + Math.cos(v.heading) * driverOffsetX + Math.sin(v.heading) * driverForward,
      roadPose.y + 1.49,
      v.z + Math.sin(v.heading) * driverOffsetX - Math.cos(v.heading) * driverForward,
    )
    camera.rotation.set(roadPose.pitch, v.heading + cameraYaw.current, 0)

    const limit = session.examId === 'subject3' ? 50 : 12
    if (Math.abs(v.speed) * 3.6 > limit) {
      speedTimer.current += dt
      if (speedTimer.current > 1.2) onInfraction({ id: 'speed-control', title: '训练区域速度控制不当', points: 10 })
    } else speedTimer.current = 0
    if (session.mode === 'exam' && Math.abs(v.speed) > .25 && v.handbrake) onInfraction({ id: 'parking-brake', title: '未松驻车制动器起步', points: 10 })
    if (Math.abs(v.speed) > .25 && !v.seatbelt) onInfraction({ id: 'seatbelt-not-fastened', title: '起步或行驶时未按规定使用安全带', points: 100, fatal: true })
    if (!['reverse-parking', 'side-parking', 'right-angle', 'curve-driving', 'slope-start'].includes(session.examId) && Math.abs(v.x) > 10.2) onInfraction({ id: 'road-boundary', title: '车辆驶出当前训练道路边界', points: 100, fatal: true })

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
    {session.examId === 'reverse-parking' ? <ReverseParkingCourse /> : session.examId === 'side-parking' ? <SideParkingCourse /> : session.examId === 'right-angle' ? <RightAngleCourse /> : session.examId === 'curve-driving' ? <CurveDrivingCourse /> : session.examId === 'slope-start' ? <SlopeStartCourse /> : <Road />}
    <group ref={carGroup}><DrivingCockpit vehicle={vehicle} showClutch={!automatic} automatic={automatic} /></group>
    <mesh rotation-x={-Math.PI / 2} position={[0, -.08, -185]}><planeGeometry args={[260, 500]} /><meshStandardMaterial color={night ? '#14201a' : '#657b59'} /></mesh>
  </>
}

function Driving({ session, candidate, onDone }: { session: Session, candidate: Candidate, onDone: (score: number, infractions: Infraction[]) => void }) {
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
  const finishLatched = useRef(false)
  const lastUi = useRef(0)
  const addInfraction = (item: Infraction) => setInfractions(prev => prev.some(x => x.id === item.id) ? prev : [...prev, item])

  useEffect(() => {
    vehicle.current = initialVehicle(activeExamId)
    setDisplay(initialVehicle(activeExamId))
    setProjectStatus(initialProjectStatus(activeExamId))
    setProjectComplete(false)
  }, [activeExamId])

  const tick = () => {
    const now = performance.now()
    if (now - lastUi.current > 80) { lastUi.current = now; setDisplay({ ...vehicle.current }) }
  }
  const score = Math.max(0, 100 - infractions.reduce((s, i) => s + i.points, 0))

  useEffect(() => {
    if (!combinedExam || session.mode !== 'exam' || finishLatched.current || infractions.length === 0) return
    if (infractions.some(i => i.fatal) || score < 80) {
      finishLatched.current = true
      onDone(score, infractions)
    }
  }, [combinedExam, infractions, onDone, score, session.mode])

  const continueCombinedExam = () => {
    if (!combinedExam) return
    if (activeIndex >= examSequence.length - 1) {
      finishLatched.current = true
      onDone(score, infractions)
      return
    }
    setActiveExamId(examSequence[activeIndex + 1])
  }

  return <div className="driving-shell">
    <Canvas camera={{ fov: 68, near: .05, far: 500 }}><DrivingWorld key={activeExamId} vehicle={vehicle} session={effectiveSession} automatic={automatic} onInfraction={addInfraction} onTick={tick} onProjectStatus={setProjectStatus} onProjectComplete={() => setProjectComplete(true)} /></Canvas>
    <div className="hud">
      <div className="hud-top"><div className="status-chip">{candidate.name} · {combinedExam ? `科目二模拟考试 ${activeIndex + 1}/${examSequence.length} · ${examTitle(activeExamId)}` : session.mode === 'exam' ? '模拟考试' : '训练'} · {session.time === 'night' ? '夜间' : '白天'}</div><button className="finish-btn" onClick={() => onDone(score, infractions)}>结束并生成成绩</button></div>
      {projectStatus && <div className="project-status">{projectStatus}</div>}
      {combinedExam && projectComplete && <div className="project-transition"><div className="eyebrow">项目完成</div><h3>{examTitle(activeExamId)}</h3><p>{activeIndex < examSequence.length - 1 ? `当前总分 ${score}，准备进入下一项目：${examTitle(examSequence[activeIndex + 1])}` : `全部 ${examSequence.length} 个项目已完成，生成科目二成绩单。`}</p><button className="primary" onClick={continueCombinedExam}>{activeIndex < examSequence.length - 1 ? '进入下一项目' : '完成考试'}</button></div>}
      <div className="instruction-card"><b>键盘驾驶 · {automatic ? 'C2 自动挡' : 'C1 手动挡'}</b><span>W 油门 · S 刹车 · A/D 方向{automatic ? '' : ' · C 离合'}</span><span>{automatic ? 'G 前进(D) · N 空挡 · R 倒挡' : '1–5 / N / R 挡位'} · Space 手刹 · I 点火</span><span>Q/E 转向灯 · V 双闪 · L 近光 · K 远光 · B 喇叭 · T 安全带</span><span>Z/X 左右观察 · F 回头观察</span></div>
      <div className="cluster"><div className="speed"><strong>{Math.round(Math.abs(display.speed) * 3.6)}</strong><span>km/h</span></div><div className="gear">{display.gear === -1 ? 'R' : display.gear === 0 ? 'N' : automatic ? 'D' : display.gear}</div><div className="lamps"><span className={display.engineOn ? 'on' : ''}>ENGINE</span><span className={display.handbrake ? 'warn' : ''}>P</span><span className={display.leftIndicator || display.hazard ? 'turn' : ''}>◀</span><span className={display.lowBeam ? 'on' : ''}>近</span><span className={display.highBeam ? 'on' : ''}>远</span><span className={display.horn ? 'warn' : ''}>HORN</span><span className={display.seatbelt ? 'on' : 'warn'}>BELT</span><span className={display.rightIndicator || display.hazard ? 'turn' : ''}>▶</span></div></div>
      {infractions.length > 0 && <div className="penalty-toast">已记录 {infractions.length} 项 · 当前 {score} 分</div>}
    </div>
  </div>
}

function Result({ candidate, session, score, infractions, onBack }: { candidate: Candidate, session: Session, score: number, infractions: Infraction[], onBack: () => void }) {
  const passLine = session.examId === 'subject3' ? 90 : 80
  const passed = score >= passLine && !infractions.some(i => i.fatal)
  return <main className="shell centered"><section className="result-card">
    <div className="eyebrow">模拟考试成绩单</div><div className={'result-mark ' + (passed ? 'passed' : 'failed')}><strong>{score}</strong><span>{passed ? '合格' : '未合格'}</span></div>
    <h1>{candidate.name}</h1><div className="result-meta"><span>{candidate.licenseType}</span><span>{session.examId}</span><span>合格线 {passLine}</span></div>
    <div className="infractions"><h3>评判记录</h3>{infractions.length === 0 ? <p>本次没有记录到扣分事件。</p> : infractions.map(i => <div key={i.id}><span>{i.title}</span><b>-{i.points}</b></div>)}</div>
    <button className="primary" onClick={onBack}>返回训练中心</button><p className="disclaimer">成绩仅用于模拟训练，不具有真实机动车驾驶人考试效力。</p>
  </section></main>
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('profile')
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [result, setResult] = useState<{ score: number, infractions: Infraction[] } | null>(null)

  if (phase === 'profile') return <Profile onSubmit={c => { setCandidate(c); setPhase('menu') }} />
  if (!candidate) return null
  if (phase === 'menu') return <Menu candidate={candidate} onStart={s => { setSession(s); setResult(null); setPhase('driving') }} />
  if (phase === 'driving' && session) return <Driving candidate={candidate} session={session} onDone={(score, infractions) => { setResult({ score, infractions }); setPhase('result') }} />
  if (phase === 'result' && session && result) return <Result candidate={candidate} session={session} score={result.score} infractions={result.infractions} onBack={() => setPhase('menu')} />
  return null
}

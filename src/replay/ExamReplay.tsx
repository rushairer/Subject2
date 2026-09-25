import type { ReactElement } from 'react'

export interface TrajectorySample {
  t: number
  x: number
  z: number
  speed: number
  gear: number
  heading: number
  project: string
}

export interface ReplayInfraction {
  id: string
  title: string
  points: number
  fatal?: boolean
  t?: number
  x?: number
  z?: number
  project?: string
}

function projectLabel(project: string) {
  const labels: Record<string, string> = {
    'reverse-parking': '倒车入库',
    'side-parking': '侧方停车',
    'slope-start': '坡道定点停车和起步',
    'curve-driving': '曲线行驶',
    'right-angle': '直角转弯',
    'subject3': '科目三道路驾驶',
  }
  return labels[project] ?? project
}

function pathStats(samples: TrajectorySample[]) {
  let distance = 0
  let maxSpeed = 0
  for (let i = 0; i < samples.length; i++) {
    maxSpeed = Math.max(maxSpeed, Math.abs(samples[i].speed) * 3.6)
    if (i > 0) distance += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z)
  }
  const duration = samples.length > 1 ? samples[samples.length - 1].t - samples[0].t : 0
  return { distance, maxSpeed, duration }
}

function PathMap({
  samples,
  infractions,
}: {
  samples: TrajectorySample[]
  infractions: ReplayInfraction[]
}) {
  const width = 640
  const height = 310
  const margin = 28
  const xs = samples.map(item => item.x)
  const zs = samples.map(item => item.z)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  const rangeX = Math.max(4, maxX - minX)
  const rangeZ = Math.max(4, maxZ - minZ)
  const scale = Math.min((width - margin * 2) / rangeX, (height - margin * 2) / rangeZ)
  const offsetX = (width - rangeX * scale) / 2
  const offsetY = (height - rangeZ * scale) / 2
  const mapPoint = (x: number, z: number) => [
    offsetX + (x - minX) * scale,
    height - (offsetY + (z - minZ) * scale),
  ] as const

  const points = samples.map(item => mapPoint(item.x, item.z).join(',')).join(' ')
  const start = mapPoint(samples[0].x, samples[0].z)
  const end = mapPoint(samples[samples.length - 1].x, samples[samples.length - 1].z)

  return <svg className="replay-map" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="本次驾驶轨迹俯视图">
    <rect x="0" y="0" width={width} height={height} rx="18" className="replay-map-bg" />
    <polyline points={points} className="replay-path-shadow" />
    <polyline points={points} className="replay-path" />
    <circle cx={start[0]} cy={start[1]} r="6" className="replay-start" />
    <circle cx={end[0]} cy={end[1]} r="6" className="replay-end" />
    {infractions.filter(item => item.x != null && item.z != null).map(item => {
      const [x, y] = mapPoint(item.x!, item.z!)
      return <g key={item.id + String(item.t)}>
        <circle cx={x} cy={y} r="8" className={item.fatal ? 'replay-error fatal' : 'replay-error'} />
        <circle cx={x} cy={y} r="3" className="replay-error-core" />
      </g>
    })}
  </svg>
}

export function ExamReplay({
  samples,
  infractions,
}: {
  samples: TrajectorySample[]
  infractions: ReplayInfraction[]
}): ReactElement | null {
  if (samples.length < 2) return null

  const projects = Array.from(new Set(samples.map(item => item.project)))

  return <section className="replay-section">
    <div className="replay-heading">
      <div>
        <div className="eyebrow">DRIVING REPLAY</div>
        <h3>驾驶轨迹复盘</h3>
      </div>
      <span>● 起点　● 终点　● 扣分位置</span>
    </div>

    <div className="replay-projects">
      {projects.map(project => {
        const projectSamples = samples.filter(item => item.project === project)
        if (projectSamples.length < 2) return null
        const projectInfractions = infractions.filter(item => item.project === project)
        const stats = pathStats(projectSamples)
        return <article className="replay-project" key={project}>
          <div className="replay-project-title">
            <strong>{projectLabel(project)}</strong>
            <div>
              <span>{stats.distance >= 1000 ? `${(stats.distance / 1000).toFixed(2)} km` : `${Math.round(stats.distance)} m`}</span>
              <span>最高 {Math.round(stats.maxSpeed)} km/h</span>
              <span>{Math.round(stats.duration)} s</span>
            </div>
          </div>
          <PathMap samples={projectSamples} infractions={projectInfractions} />
        </article>
      })}
    </div>

    <div className="replay-timeline">
      <h3>错误时间轴</h3>
      {infractions.length === 0
        ? <p>本次没有扣分事件。</p>
        : [...infractions]
            .sort((a, b) => (a.t ?? 0) - (b.t ?? 0))
            .map(item => <div className="replay-event" key={item.id + String(item.t)}>
              <time>{item.t != null ? `${item.t.toFixed(1)}s` : '--'}</time>
              <div>
                <strong>{item.title}</strong>
                <span>{item.project ? projectLabel(item.project) : '驾驶过程'}</span>
              </div>
              <b>{item.fatal ? '不合格' : `-${item.points}`}</b>
            </div>)}
    </div>
  </section>
}

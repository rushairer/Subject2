export interface DrivingDynamicsSample {
  t: number
  project: string
  speed: number
  gear: number
  automatic?: boolean
}

export interface DrivingDynamicsGearChange {
  sampleIndex: number
  t: number
  project: string
  fromGear: number
  toGear: number
}

export interface DrivingDynamicsChartSample extends DrivingDynamicsSample {
  sampleIndex: number
}

export interface DrivingDynamicsTimelineModel {
  samples: DrivingDynamicsSample[]
  chartSamples: DrivingDynamicsChartSample[]
  startTime: number
  endTime: number
  durationSeconds: number
  maxSpeedKmh: number
  gearChanges: DrivingDynamicsGearChange[]
}

function finiteSample(sample: DrivingDynamicsSample) {
  return (
    Number.isFinite(sample.t) &&
    Number.isFinite(sample.speed) &&
    Number.isFinite(sample.gear) &&
    typeof sample.project === 'string' &&
    sample.project.length > 0
  )
}

function sampleIndicesForChart(
  samples: readonly DrivingDynamicsSample[],
  maximumChartPoints: number,
) {
  if (samples.length <= maximumChartPoints) {
    return samples.map((_, index) => index)
  }

  const required = new Set<number>([0, samples.length - 1])
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index].gear !== samples[index - 1].gear) {
      required.add(index - 1)
      required.add(index)
    }
  }

  const budget = Math.max(maximumChartPoints, required.size)
  const evenlySpacedCount = Math.max(2, budget - required.size + 2)
  const lastIndex = samples.length - 1

  for (let slot = 0; slot < evenlySpacedCount; slot += 1) {
    const ratio = evenlySpacedCount <= 1 ? 0 : slot / (evenlySpacedCount - 1)
    required.add(Math.round(lastIndex * ratio))
  }

  return [...required].sort((a, b) => a - b)
}

export function buildDrivingDynamicsTimeline(
  input: readonly DrivingDynamicsSample[],
  maximumChartPoints = 360,
): DrivingDynamicsTimelineModel {
  const samples = input
    .filter(finiteSample)
    .slice()
    .sort((a, b) => a.t - b.t)

  if (samples.length === 0) {
    return {
      samples: [],
      chartSamples: [],
      startTime: 0,
      endTime: 0,
      durationSeconds: 0,
      maxSpeedKmh: 0,
      gearChanges: [],
    }
  }

  const gearChanges: DrivingDynamicsGearChange[] = []
  let maxSpeedKmh = 0

  for (let index = 0; index < samples.length; index += 1) {
    maxSpeedKmh = Math.max(maxSpeedKmh, Math.abs(samples[index].speed) * 3.6)
    if (index > 0 && samples[index].gear !== samples[index - 1].gear) {
      gearChanges.push({
        sampleIndex: index,
        t: samples[index].t,
        project: samples[index].project,
        fromGear: samples[index - 1].gear,
        toGear: samples[index].gear,
      })
    }
  }

  const startTime = samples[0].t
  const endTime = samples[samples.length - 1].t
  const chartSamples = sampleIndicesForChart(
    samples,
    Math.max(12, Math.floor(maximumChartPoints)),
  ).map(sampleIndex => ({
    ...samples[sampleIndex],
    sampleIndex,
  }))

  return {
    samples,
    chartSamples,
    startTime,
    endTime,
    durationSeconds: Math.max(0, endTime - startTime),
    maxSpeedKmh,
    gearChanges,
  }
}

export function dynamicsGearLabel(sample: Pick<DrivingDynamicsSample, 'gear' | 'automatic'>) {
  if (sample.gear < 0) return 'R'
  if (sample.gear === 0) return 'N'
  return sample.automatic ? 'D' : String(sample.gear)
}

export interface ReplayContextSample {
  t: number
  project: string
}

export function nearestReplaySample<T extends ReplayContextSample>(
  samples: readonly T[],
  project: string | undefined,
  time: number | undefined,
): T | null {
  if (project == null || time == null || !Number.isFinite(time)) return null

  let nearest: T | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const sample of samples) {
    if (sample.project !== project) continue
    const distance = Math.abs(sample.t - time)
    if (distance < nearestDistance) {
      nearest = sample
      nearestDistance = distance
    }
  }

  return nearest
}

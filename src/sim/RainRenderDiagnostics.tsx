import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'

/**
 * Opt-in WebGL workload probe. This reports measured render calls and retained
 * WebGL object counts, not a claim about FPS on physical user devices.
 * Enable with ?renderDiagnostics=1 in a rainy practice session.
 */
export function RainRenderDiagnostics() {
  const { gl } = useThree()
  const enabled = useMemo(() =>
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('renderDiagnostics') === '1',
  [])
  const frameCount = useRef(0)
  const sampleSeconds = useRef(0)
  const sampleFps = useRef(0)
  const drawCalls = useRef(0)
  const triangles = useRef(0)

  useFrame((_, delta) => {
    if (!enabled) return
    frameCount.current += 1
    sampleSeconds.current += Number.isFinite(delta) ? Math.max(0, delta) : 0
    // Render stats are sampled after the preceding frame has completed.
    drawCalls.current = Math.max(drawCalls.current, gl.info.render.calls)
    triangles.current = Math.max(triangles.current, gl.info.render.triangles)
    if (sampleSeconds.current < 1) return
    sampleFps.current = frameCount.current / sampleSeconds.current
    const holder = window as Window & { __subject2RainPerf?: object }
    holder.__subject2RainPerf = {
      fps: Math.round(sampleFps.current * 10) / 10,
      peakFrameDrawCalls: drawCalls.current,
      peakFrameTriangles: triangles.current,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      sampleFrames: frameCount.current,
      renderer: gl.getContext().getParameter(gl.getContext().RENDERER),
    }
    frameCount.current = 0
    sampleSeconds.current = 0
    drawCalls.current = 0
    triangles.current = 0
  })
  return null
}

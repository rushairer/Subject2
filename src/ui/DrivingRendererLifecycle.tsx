import { useLayoutEffect } from 'react'
import { useThree } from '@react-three/fiber'

/**
 * Releases the current WebGL renderer synchronously when a driving surface
 * unmounts. This prevents a fast result -> targeted-practice transition from
 * briefly keeping two heavyweight renderer contexts alive at the same time.
 */
export function DrivingRendererLifecycle() {
  const gl = useThree(state => state.gl)

  useLayoutEffect(() => () => {
    gl.setAnimationLoop(null)
    gl.setRenderTarget(null)
    gl.renderLists.dispose()
    gl.dispose()
    gl.forceContextLoss()
  }, [gl])

  return null
}

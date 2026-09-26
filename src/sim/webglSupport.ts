interface WebGLContextProbe {
  getExtension?: (name: string) => { loseContext?: () => void } | null
}

export interface WebGLCanvasProbe {
  getContext(contextId: 'webgl2'): WebGLContextProbe | null
}

export function supportsWebGL2(
  createCanvas: () => WebGLCanvasProbe = () => document.createElement('canvas'),
): boolean {
  try {
    const context = createCanvas().getContext('webgl2')
    if (!context) return false
    context.getExtension?.('WEBGL_lose_context')?.loseContext?.()
    return true
  } catch {
    return false
  }
}

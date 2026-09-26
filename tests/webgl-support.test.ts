import assert from 'node:assert/strict'
import test from 'node:test'
import { supportsWebGL2 } from '../src/sim/webglSupport'

test('WebGL2 preflight succeeds and releases its probe context', () => {
  let released = false
  const supported = supportsWebGL2(() => ({
    getContext: contextId => contextId === 'webgl2'
      ? {
          getExtension: name => name === 'WEBGL_lose_context'
            ? { loseContext: () => { released = true } }
            : null,
        }
      : null,
  }))

  assert.equal(supported, true)
  assert.equal(released, true)
})

test('WebGL2 preflight rejects an unavailable context', () => {
  assert.equal(supportsWebGL2(() => ({ getContext: () => null })), false)
})

test('WebGL2 preflight converts browser/security exceptions into unsupported', () => {
  assert.equal(supportsWebGL2(() => {
    throw new Error('graphics blocked')
  }), false)
})

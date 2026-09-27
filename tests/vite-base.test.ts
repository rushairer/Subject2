import assert from 'node:assert/strict'
import test from 'node:test'
import viteConfig from '../vite.config'

test('production assets keep a relative base for Pages subpaths and custom-domain roots', () => {
  assert.equal(viteConfig.base, './')
})

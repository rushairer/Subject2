import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const boundarySource = readFileSync(new URL('../src/ui/DrivingCanvasBoundary.tsx', import.meta.url), 'utf8')

test('driving Canvas is protected by the renderer error boundary', () => {
  assert.match(appSource, /<DrivingCanvasBoundary onError=\{\(\) => setRendererFailed\(true\)\}>/)
  assert.match(appSource, /<Canvas camera=/)
  assert.match(boundarySource, /getDerivedStateFromError/)
  assert.match(boundarySource, /componentDidCatch/)
})

test('renderer failure uses the recoverable no-score fallback', () => {
  assert.match(appSource, /rendererFailed \? '3D 渲染器初始化失败'/)
  assert.match(appSource, /setRendererFailed\(false\)/)
  assert.match(appSource, /onClick=\{onExit\}>返回训练中心/)
  assert.match(appSource, /不会记录成绩，也不会把本次启动失败计为考试未完成/)
})

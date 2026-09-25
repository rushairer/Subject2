import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'

export interface LightTestVehicle {
  lowBeam: boolean
  highBeam: boolean
}

type Answer = 'low' | 'flash'

interface Prompt {
  id: string
  text: string
  hint: string
  answer: Answer
}

const PROMPTS: Prompt[] = [
  {
    id: 'meeting',
    text: '夜间与机动车会车',
    hint: '使用近光灯',
    answer: 'low',
  },
  {
    id: 'following',
    text: '夜间同方向近距离跟车行驶',
    hint: '不得使用远光灯，应使用近光灯',
    answer: 'low',
  },
  {
    id: 'uncontrolled-intersection',
    text: '夜间通过没有交通信号灯控制的路口',
    hint: '交替使用远近光灯示意',
    answer: 'flash',
  },
  {
    id: 'crosswalk',
    text: '夜间通过人行横道',
    hint: '交替使用远近光灯示意',
    answer: 'flash',
  },
]

function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = 0.96
  utterance.volume = 0.9
  window.speechSynthesis.speak(utterance)
}

export function NightLightTest({
  vehicle,
  onPass,
  onFail,
}: {
  vehicle: MutableRefObject<LightTestVehicle>
  onPass: () => void
  onFail: (prompt: string) => void
}) {
  const prompts = useMemo(() => [...PROMPTS].sort(() => Math.random() - 0.5).slice(0, 3), [])
  const [index, setIndex] = useState(0)
  const [remaining, setRemaining] = useState(5)
  const actionCount = useRef(0)
  const onPassRef = useRef(onPass)
  const onFailRef = useRef(onFail)
  const prompt = prompts[index]
  onPassRef.current = onPass
  onFailRef.current = onFail

  useEffect(() => {
    let resolved = false
    actionCount.current = 0
    setRemaining(5)
    speak(`模拟夜间灯光考试。${prompt.text}。`)

    const keyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (key === 'l' || key === 'k') actionCount.current += 1
    }
    window.addEventListener('keydown', keyDown)

    const start = performance.now()
    const interval = window.setInterval(() => {
      if (resolved) return
      const elapsed = (performance.now() - start) / 1000
      setRemaining(Math.max(0, 5 - elapsed))
      const state = vehicle.current
      const correct =
        prompt.answer === 'low'
          ? actionCount.current > 0 && state.lowBeam && !state.highBeam
          : actionCount.current >= 2 && state.lowBeam && !state.highBeam

      if (correct) {
        resolved = true
        window.clearInterval(interval)
        window.clearTimeout(timeout)
        if (index >= prompts.length - 1) {
          speak('模拟夜间灯光考试完成。请关闭不需要的灯光，准备起步。')
          onPassRef.current()
        } else {
          setIndex(value => value + 1)
        }
      }
    }, 100)

    const timeout = window.setTimeout(() => {
      if (resolved) return
      resolved = true
      window.clearInterval(interval)
      onFailRef.current(prompt.text)
    }, 5000)

    return () => {
      resolved = true
      window.clearInterval(interval)
      window.clearTimeout(timeout)
      window.removeEventListener('keydown', keyDown)
    }
  }, [index, prompt, prompts.length, vehicle])

  return <div className="light-test">
    <div className="eyebrow">科目三 · 模拟夜间灯光考试</div>
    <div className="light-test-progress">第 {index + 1} / {prompts.length} 题 · {remaining.toFixed(1)} 秒</div>
    <h2>{prompt.text}</h2>
    <p>请听完口令后再操作。当前可用：<b>L 近光灯</b>、<b>K 远光灯切换</b>。</p>
    <div className="light-test-hint">训练提示：{prompt.hint}</div>
  </div>
}

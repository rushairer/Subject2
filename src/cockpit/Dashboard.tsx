import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { CockpitVehicleState } from './DrivingCockpit'
import { Upholstery } from './interiorParts'

function dial(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, value: number, max: number, label: string) {
  ctx.fillStyle = '#161d1b'; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#78857c'; ctx.lineWidth = 3; ctx.stroke()
  for (let i = 0; i <= 40; i++) {
    const angle = Math.PI * 0.75 + i / 40 * Math.PI * 1.5
    const outer = radius - 9, inner = outer - (i % 5 === 0 ? 19 : 9)
    ctx.strokeStyle = '#d2ded2'; ctx.lineWidth = i % 5 === 0 ? 3 : 1
    ctx.beginPath(); ctx.moveTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer); ctx.lineTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner); ctx.stroke()
    if (i % 5 === 0) {
      ctx.font = '22px sans-serif'; ctx.fillStyle = '#e1e9db'; ctx.textAlign = 'center'
      ctx.fillText(String(Math.round(i / 40 * max)), x + Math.cos(angle) * (radius - 43), y + Math.sin(angle) * (radius - 43) + 8)
    }
  }
  ctx.font = '20px sans-serif'; ctx.fillStyle = '#c2cfbd'; ctx.textAlign = 'center'; ctx.fillText(label, x, y + 55)
  const a = Math.PI * 0.75 + Math.min(max, Math.max(0, value)) / max * Math.PI * 1.5
  ctx.strokeStyle = '#e76543'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * 12, y - Math.sin(a) * 12); ctx.lineTo(x + Math.cos(a) * (radius - 31), y + Math.sin(a) * (radius - 31)); ctx.stroke()
  ctx.fillStyle = '#a1aaa2'; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill()
}

export function Dashboard({ vehicle, automatic }: { vehicle: MutableRefObject<CockpitVehicleState>; automatic: boolean }) {
  const display = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 384
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace
    return { canvas, texture }
  }, [])
  const elapsed = useRef(1)
  useEffect(() => () => display.texture.dispose(), [display])
  useFrame(({ clock }, dt) => {
    elapsed.current += dt; if (elapsed.current < 0.08) return; elapsed.current = 0
    const ctx = display.canvas.getContext('2d')!; const v = vehicle.current
    ctx.fillStyle = '#0c1311'; ctx.fillRect(0, 0, 1024, 384)
    dial(ctx, 222, 178, 154, Math.abs(v.speed) * 3.6, 160, '公里 / 时')
    dial(ctx, 793, 178, 154, v.engineRpm / 1000, 8, '转速 ×1000')
    ctx.textAlign = 'center'; ctx.fillStyle = '#b7c7a6'; ctx.fillRect(419, 118, 186, 104)
    ctx.fillStyle = '#27372d'; ctx.font = 'bold 42px sans-serif'
    ctx.fillText(v.gear === -1 ? '倒挡' : v.gear === 0 ? '空挡' : automatic ? '前进' : `${v.gear} 挡`, 512, 164)
    ctx.font = '20px sans-serif'; ctx.fillText(`时速 ${Math.round(Math.abs(v.speed) * 3.6)}`, 512, 203)
    const blink = Math.sin(clock.elapsedTime * Math.PI * 2.2) > 0
    ctx.font = 'bold 36px sans-serif'; ctx.fillStyle = (v.leftIndicator || v.hazard) && blink ? '#71e572' : '#21362a'; ctx.fillText('◀', 435, 66)
    ctx.fillStyle = (v.rightIndicator || v.hazard) && blink ? '#71e572' : '#21362a'; ctx.fillText('▶', 589, 66)
    const lamps = [
      { text: v.engineOn ? '发动机运行' : '发动机关闭', on: v.engineOn, color: '#b9d493' },
      { text: v.handbrake ? '手刹拉起' : '手刹放下', on: v.handbrake, color: '#f48a5a' },
      { text: v.seatbelt ? '安全带已系' : '请系安全带', on: true, color: v.seatbelt ? '#9ad18b' : '#ff785b' },
      { text: v.highBeam ? '远光灯' : v.lowBeam ? '近光灯' : '灯光关闭', on: v.highBeam || v.lowBeam, color: '#87cad7' },
    ]
    ctx.font = '22px sans-serif'
    lamps.forEach((l, i) => { ctx.fillStyle = l.on ? l.color : '#65766a'; ctx.fillText(l.text, 142 + i * 246, 359) })
    display.texture.needsUpdate = true
  })
  return <group name="仪表台">
    <Upholstery position={[0, 0.88, -0.85]} size={[1.65, 0.36, 0.36]} color="#414947" radius={0.07} />
    <Upholstery position={[0, 1.052, -0.87]} size={[1.66, 0.06, 0.41]} color="#303937" radius={0.025} />
    <group position={[-0.43, 1.105, -0.735]} rotation-x={-0.18}>
      <Upholstery position={[0, 0, -0.035]} size={[0.66, 0.245, 0.13]} color="#29312f" radius={0.045} />
      <mesh position-z={0.035}><planeGeometry args={[0.59, 0.221]} /><meshBasicMaterial map={display.texture} toneMapped={false} /></mesh>
    </group>
    <Upholstery position={[0.30, 0.92, -0.64]} size={[0.38, 0.20, 0.035]} color="#252e2b" radius={0.016} />
    {[-0.012, 0.07, 0.15].map(x => <Upholstery key={x} position={[x + 0.20, 0.87, -0.612]} size={[0.042, 0.045, 0.015]} color="#5a625c" radius={0.008} />)}
    {[-0.75, 0.25, 0.69].map(x => <group key={x}>
      <Upholstery position={[x, 1.015, -0.66]} size={[x === 0.25 ? 0.26 : 0.14, 0.065, 0.018]} color="#1b2623" radius={0.007} />
      {[-0.02, 0, 0.02].map(y => <Upholstery key={y} position={[x, 1.015 + y, -0.647]} size={[x === 0.25 ? 0.23 : 0.12, 0.004, 0.014]} color="#64716a" radius={0.001} />)}
    </group>)}
    <Upholstery position={[0.62, 0.84, -0.647]} size={[0.17, 0.022, 0.018]} color="#788078" radius={0.005} />
  </group>
}

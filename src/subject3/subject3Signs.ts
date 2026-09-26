import * as THREE from 'three'

function createSignCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (typeof document === 'undefined') {
    const ctx = new Proxy({}, {
      get: () => () => {},
      set: () => true,
    }) as unknown as CanvasRenderingContext2D
    const canvas = { width, height, getContext: () => ctx } as unknown as HTMLCanvasElement
    return { canvas, ctx }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  return { canvas, ctx }
}

function wrapTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/**
 * Standard Chinese circular Speed Limit sign (GB 5768.2 禁令标志: 限速50)
 * Red circular ring, pure white background, bold black numerals "50"
 */
export function makeSpeedLimitTexture(limit = 50): THREE.CanvasTexture {
  const { canvas, ctx } = createSignCanvas(512, 512)
  const cx = 256
  const cy = 256

  // Red outer ring
  ctx.beginPath()
  ctx.arc(cx, cy, 246, 0, Math.PI * 2)
  ctx.fillStyle = '#dc2626'
  ctx.fill()

  // White inner disk
  ctx.beginPath()
  ctx.arc(cx, cy, 192, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  // Bold black number
  ctx.fillStyle = '#111827'
  ctx.font = '900 230px Arial Black, Impact, "PingFang SC", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(limit), cx, cy + 10)

  return wrapTexture(canvas)
}

/**
 * Standard Chinese Crosswalk indicator sign (GB 5768.2 人行横道指示标志)
 * Blue square, white triangle, pedestrian silhouette walking on zebra stripes
 */
export function makeCrosswalkSignTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = createSignCanvas(512, 512)

  // Blue background
  ctx.fillStyle = '#0284c7'
  ctx.fillRect(0, 0, 512, 512)

  // White border
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 16
  ctx.strokeRect(16, 16, 480, 480)

  // White equilateral triangle
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(256, 56)
  ctx.lineTo(446, 436)
  ctx.lineTo(66, 436)
  ctx.closePath()
  ctx.fill()

  // Black zebra stripes inside triangle
  ctx.fillStyle = '#0f172a'
  const stripeY = [355, 375, 395, 415]
  stripeY.forEach(y => {
    ctx.fillRect(160, y, 192, 12)
  })

  // Walking pedestrian silhouette
  // Head
  ctx.beginPath()
  ctx.arc(260, 165, 24, 0, Math.PI * 2)
  ctx.fill()

  // Torso
  ctx.beginPath()
  ctx.moveTo(246, 196)
  ctx.lineTo(276, 196)
  ctx.lineTo(262, 290)
  ctx.lineTo(240, 290)
  ctx.closePath()
  ctx.fill()

  // Left leg stride
  ctx.beginPath()
  ctx.moveTo(245, 285)
  ctx.lineTo(210, 365)
  ctx.lineTo(228, 368)
  ctx.lineTo(258, 295)
  ctx.closePath()
  ctx.fill()

  // Right leg stride
  ctx.beginPath()
  ctx.moveTo(255, 285)
  ctx.lineTo(298, 365)
  ctx.lineTo(315, 360)
  ctx.lineTo(272, 290)
  ctx.closePath()
  ctx.fill()

  // Arms
  ctx.lineWidth = 14
  ctx.strokeStyle = '#0f172a'
  ctx.beginPath()
  ctx.moveTo(240, 220)
  ctx.lineTo(215, 275)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(270, 220)
  ctx.lineTo(305, 265)
  ctx.stroke()

  return wrapTexture(canvas)
}

/**
 * Standard Chinese School Zone warning sign (GB 5768.2 注意儿童/学校区域警告标志)
 * Yellow warning triangle with black border and children walking pictogram
 */
export function makeSchoolSignTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = createSignCanvas(512, 512)

  // Background clear
  ctx.clearRect(0, 0, 512, 512)

  // Yellow triangle with rounded-like tip
  ctx.fillStyle = '#fbbf24'
  ctx.beginPath()
  ctx.moveTo(256, 30)
  ctx.lineTo(484, 436)
  ctx.lineTo(28, 436)
  ctx.closePath()
  ctx.fill()

  // Thick black border
  ctx.strokeStyle = '#18181b'
  ctx.lineWidth = 32
  ctx.lineJoin = 'round'
  ctx.stroke()

  // Inner black silhouette: Two school children
  ctx.fillStyle = '#18181b'

  // Student 1 (taller):
  ctx.beginPath()
  ctx.arc(225, 175, 20, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(210, 200, 30, 80)
  // Backpack
  ctx.fillRect(195, 210, 16, 45)
  // Legs
  ctx.fillRect(208, 280, 14, 85)
  ctx.fillRect(228, 280, 14, 85)

  // Student 2 (smaller):
  ctx.beginPath()
  ctx.arc(295, 205, 17, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(282, 226, 26, 68)
  // Backpack
  ctx.fillRect(307, 232, 14, 38)
  // Legs
  ctx.fillRect(280, 294, 12, 70)
  ctx.fillRect(298, 294, 12, 70)

  // Holding hands line
  ctx.strokeStyle = '#18181b'
  ctx.lineWidth = 10
  ctx.beginPath()
  ctx.moveTo(238, 240)
  ctx.lineTo(284, 250)
  ctx.stroke()

  // Text label below
  ctx.font = '700 36px "PingFang SC", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('学校区域', 256, 410)

  return wrapTexture(canvas)
}

/**
 * Standard Chinese Bus Stop sign (GB 5768.2 公共汽车站标志)
 * Blue square, white bus graphic, "公交站 / BUS"
 */
export function makeBusStopSignTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = createSignCanvas(512, 512)

  // Blue background
  ctx.fillStyle = '#0284c7'
  ctx.fillRect(0, 0, 512, 512)

  // White border
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 16
  ctx.strokeRect(16, 16, 480, 480)

  // Bus silhouette in white
  ctx.fillStyle = '#ffffff'
  // Bus body
  ctx.beginPath()
  ctx.roundRect(110, 80, 292, 180, [24, 24, 8, 8])
  ctx.fill()

  // Bus windows cut out in blue
  ctx.fillStyle = '#0284c7'
  ctx.fillRect(130, 105, 115, 65) // front windshield
  ctx.fillRect(260, 105, 120, 65) // side window

  // Wheels
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(145, 260, 45, 22)
  ctx.fillRect(320, 260, 45, 22)

  // Headlights
  ctx.beginPath()
  ctx.arc(140, 220, 12, 0, Math.PI * 2)
  ctx.arc(370, 220, 12, 0, Math.PI * 2)
  ctx.fill()

  // Bumper line
  ctx.fillRect(160, 235, 192, 10)

  // Text
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 70px "PingFang SC", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('公交站', 256, 360)

  ctx.font = '700 42px Arial, sans-serif'
  ctx.fillText('BUS', 256, 430)

  return wrapTexture(canvas)
}

/**
 * Standard Chinese U-Turn sign (GB 5768.2 允许掉头指示标志)
 * Blue circular sign, white circular border, white 180-degree curving arrow
 */
export function makeUTurnSignTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = createSignCanvas(512, 512)
  const cx = 256
  const cy = 256

  // Blue circle
  ctx.fillStyle = '#0284c7'
  ctx.beginPath()
  ctx.arc(cx, cy, 246, 0, Math.PI * 2)
  ctx.fill()

  // White border
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 14
  ctx.beginPath()
  ctx.arc(cx, cy, 228, 0, Math.PI * 2)
  ctx.stroke()

  // White U-turn arrow
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 36
  ctx.lineCap = 'butt'

  // Arc curving up and around: from right side up and over to left side
  ctx.beginPath()
  ctx.arc(cx, 210, 80, 0, Math.PI, true)
  ctx.stroke()

  // Right vertical shaft
  ctx.beginPath()
  ctx.moveTo(cx + 80, 210)
  ctx.lineTo(cx + 80, 360)
  ctx.stroke()

  // Left downward shaft
  ctx.beginPath()
  ctx.moveTo(cx - 80, 210)
  ctx.lineTo(cx - 80, 300)
  ctx.stroke()

  // Arrowhead pointing DOWN on left
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(cx - 80, 380) // arrowhead tip
  ctx.lineTo(cx - 130, 285)
  ctx.lineTo(cx - 30, 285)
  ctx.closePath()
  ctx.fill()

  return wrapTexture(canvas)
}

/**
 * Standard Chinese Driving Exam Project sign (考试起点 / 靠边停车)
 * High-visibility road direction green/blue panel with double white border
 */
export function makeExamProjectSignTexture(label: string): THREE.CanvasTexture {
  const { canvas, ctx } = createSignCanvas(512, 300)

  ctx.fillStyle = '#0284c7'
  ctx.fillRect(0, 0, 512, 300)

  // Outer and inner white borders
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 14
  ctx.strokeRect(10, 10, 492, 280)

  ctx.lineWidth = 3
  ctx.strokeRect(26, 26, 460, 248)

  // Text
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 68px "PingFang SC", "Heiti SC", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 256, 150)

  return wrapTexture(canvas)
}

/**
 * Standard Road Surface Turn Guide Arrow (GB 5768.3 路面导向箭头)
 */
export function makeArrowTexture(type: 'straight' | 'left' | 'straight-left' | 'straight-right'): THREE.CanvasTexture {
  const { canvas, ctx } = createSignCanvas(256, 512)
  ctx.clearRect(0, 0, 256, 512)
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#ffffff'

  const cx = 128

  if (type === 'straight') {
    // Shaft
    ctx.fillRect(cx - 16, 180, 32, 280)
    // Arrowhead
    ctx.beginPath()
    ctx.moveTo(cx, 50)
    ctx.lineTo(cx + 60, 190)
    ctx.lineTo(cx - 60, 190)
    ctx.closePath()
    ctx.fill()
  } else if (type === 'left') {
    // Upright shaft
    ctx.fillRect(cx + 10, 280, 30, 180)
    // Left curve
    ctx.lineWidth = 30
    ctx.beginPath()
    ctx.moveTo(cx + 25, 290)
    ctx.quadraticCurveTo(cx + 25, 190, 80, 190)
    ctx.stroke()
    // Arrowhead pointing left
    ctx.beginPath()
    ctx.moveTo(30, 190)
    ctx.lineTo(95, 135)
    ctx.lineTo(95, 245)
    ctx.closePath()
    ctx.fill()
  } else if (type === 'straight-left') {
    // Main straight shaft
    ctx.fillRect(cx - 14, 180, 28, 280)
    // Straight arrowhead
    ctx.beginPath()
    ctx.moveTo(cx, 50)
    ctx.lineTo(cx + 45, 185)
    ctx.lineTo(cx - 45, 185)
    ctx.closePath()
    ctx.fill()

    // Left branch
    ctx.lineWidth = 26
    ctx.beginPath()
    ctx.moveTo(cx - 10, 320)
    ctx.quadraticCurveTo(cx - 10, 230, 60, 230)
    ctx.stroke()
    // Left arrowhead
    ctx.beginPath()
    ctx.moveTo(20, 230)
    ctx.lineTo(75, 185)
    ctx.lineTo(75, 275)
    ctx.closePath()
    ctx.fill()
  } else {
    // straight-right
    // Main straight shaft
    ctx.fillRect(cx - 14, 180, 28, 280)
    // Straight arrowhead
    ctx.beginPath()
    ctx.moveTo(cx, 50)
    ctx.lineTo(cx + 45, 185)
    ctx.lineTo(cx - 45, 185)
    ctx.closePath()
    ctx.fill()

    // Right branch
    ctx.lineWidth = 26
    ctx.beginPath()
    ctx.moveTo(cx + 10, 320)
    ctx.quadraticCurveTo(cx + 10, 230, 196, 230)
    ctx.stroke()
    // Right arrowhead
    ctx.beginPath()
    ctx.moveTo(236, 230)
    ctx.lineTo(181, 185)
    ctx.lineTo(181, 275)
    ctx.closePath()
    ctx.fill()
  }

  return wrapTexture(canvas)
}

/**
 * Standard Crosswalk Diamond Warning Marking (GB 5768.3 人行横道预告标线 - 菱形)
 */
export function makeDiamondTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = createSignCanvas(256, 512)
  ctx.clearRect(0, 0, 256, 512)

  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 32
  ctx.lineJoin = 'miter'

  ctx.beginPath()
  ctx.moveTo(128, 25)
  ctx.lineTo(236, 256)
  ctx.lineTo(128, 487)
  ctx.lineTo(20, 256)
  ctx.closePath()
  ctx.stroke()

  return wrapTexture(canvas)
}

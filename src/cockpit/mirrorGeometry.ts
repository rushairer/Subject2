import * as THREE from 'three'

export function mirrorGeometry(width: number, height: number, radius: number) {
  const x = -width / 2, y = -height / 2, r = radius
  const s = new THREE.Shape()
  s.moveTo(x + r, y)
  s.lineTo(x + width - r, y); s.quadraticCurveTo(x + width, y, x + width, y + r)
  s.lineTo(x + width, y + height - r); s.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  s.lineTo(x + r, y + height); s.quadraticCurveTo(x, y + height, x, y + height - r)
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y)
  const g = new THREE.ShapeGeometry(s, 8)
  // ShapeGeometry's default UVs are XY in metres, not a [0,1] image aperture.
  const uv = g.getAttribute('uv'), p = g.getAttribute('position')
  for (let i = 0; i < uv.count; i++) uv.setXY(i, THREE.MathUtils.clamp(p.getX(i) / width + 0.5, 0, 1), THREE.MathUtils.clamp(p.getY(i) / height + 0.5, 0, 1))
  return g
}


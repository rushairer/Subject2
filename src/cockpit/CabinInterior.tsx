import { memo } from 'react'
import { BeltWebbing, Rod, Upholstery } from './interiorParts'

function Seat({ x }: { x: number }) {
  return <group name={x < 0 ? '驾驶座椅' : '副驾驶座椅'}>
    <Upholstery position={[x, 0.55, 0.38]} size={[0.54, 0.17, 0.62]} color="#3f4445" />
    <Upholstery position={[x, 0.64, 0.35]} size={[0.37, 0.045, 0.47]} color="#777873" radius={0.014} />
    <Upholstery position={[x, 0.94, 0.69]} size={[0.54, 0.65, 0.16]} color="#414849" rotation={[0.12, 0, 0]} />
    <Upholstery position={[x, 0.96, 0.592]} size={[0.37, 0.49, 0.026]} color="#777873" radius={0.012} rotation={[0.12, 0, 0]} />
    {[-0.22, 0.22].map(offset => <Upholstery key={offset} position={[x + offset, 0.88, 0.60]} size={[0.075, 0.43, 0.16]} color="#4b5050" />)}
    {[-0.075, 0.075].map(offset => <Rod key={offset} from={[x + offset, 1.22, 0.71]} to={[x + offset, 1.34, 0.71]} radius={0.009} color="#a6a9a6" />)}
    <Upholstery position={[x, 1.36, 0.71]} size={[0.29, 0.19, 0.13]} color="#515957" />
    {[-0.115, 0, 0.115].map(offset => <Rod key={offset} from={[x + offset, 0.755, 0.57]} to={[x + offset, 1.17, 0.62]} radius={0.002} color="#9a9990" />)}
  </group>
}

export const CabinInterior = memo(function CabinInterior({ seatbelt }: { seatbelt: boolean }) {
  return <group name="座舱与安全带">
    <Upholstery position={[0, 0.48, 0.1]} size={[1.61, 0.07, 2.58]} color="#292e2e" />
    <Upholstery position={[0, 0.67, 1.07]} size={[1.42, 0.22, 0.39]} color="#646964" />
    <Upholstery position={[0, 0.90, 1.29]} size={[1.43, 0.48, 0.10]} color="#515957" />
    <Seat x={-0.43} /><Seat x={0.43} />
    {[-1, 1].map(side => <group key={side}>
      <Upholstery position={[side * 0.838, 0.80, -0.15]} size={[0.035, 0.33, 1.13]} color="#5a605c" radius={0.009} />
      <Upholstery position={[side * 0.80, 0.82, -0.05]} size={[0.095, 0.055, 0.38]} color="#323a39" radius={0.015} />
      <Upholstery position={[side * 0.81, 0.93, -0.38]} size={[0.025, 0.025, 0.15]} color="#a5aaa5" radius={0.006} />
    </group>)}
    <Upholstery position={[-0.81, 1.24, 0.25]} size={[0.032, 0.065, 0.055]} color="#4a5050" radius={0.012} />
    {seatbelt ? <>
      <BeltWebbing points={[[-0.80, 1.24, 0.25], [-0.64, 1.16, 0.31], [-0.38, 0.92, 0.20], [-0.17, 0.64, 0.22]]} />
      <BeltWebbing points={[[-0.17, 0.64, 0.22], [-0.44, 0.67, 0.17], [-0.70, 0.61, 0.28]]} />
      <Upholstery position={[-0.17, 0.65, 0.22]} size={[0.052, 0.065, 0.025]} color="#999f9b" radius={0.008} />
    </> : <BeltWebbing points={[[-0.80, 1.24, 0.25], [-0.80, 0.91, 0.26], [-0.79, 0.55, 0.28]]} />}
    <Upholstery position={[-0.14, 0.61, 0.23]} size={[0.065, 0.11, 0.07]} color="#34393a" radius={0.015} />
    <Upholstery position={[-0.14, 0.66, 0.268]} size={[0.045, 0.025, 0.008]} color="#b7352b" radius={0.005} />
  </group>
})

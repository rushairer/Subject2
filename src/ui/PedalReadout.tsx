interface PedalReadoutProps {
  automatic: boolean
  throttle: number
  brake: number
  clutch: number
}

function PedalMeter({ label, value, kind }: {
  label: string
  value: number
  kind: 'throttle' | 'brake' | 'clutch'
}) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100)

  return <div className={`pedal-channel ${kind}`}>
    <span className="pedal-label"><span>{label}</span><b>{percent}%</b></span>
    <meter min={0} max={100} value={percent} aria-label={`${label}开度`} aria-valuetext={`${percent}%`} />
  </div>
}

export function PedalReadout({ automatic, throttle, brake, clutch }: PedalReadoutProps) {
  return <div className="pedal-readout" role="group" aria-label="实时踏板开度">
    <PedalMeter label="油门" value={throttle} kind="throttle" />
    <PedalMeter label="刹车" value={brake} kind="brake" />
    {!automatic && <PedalMeter label="离合" value={clutch} kind="clutch" />}
  </div>
}

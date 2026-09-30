export function DrivingHelp({ automatic, expanded, onToggle }: {
  automatic: boolean
  expanded: boolean
  onToggle: () => void
}) {
  return <section className={`instruction-card${expanded ? ' expanded' : ''}`} aria-label="键盘操作说明">
    <button className="instruction-toggle" onClick={onToggle} aria-expanded={expanded} aria-controls="driving-help-details" aria-keyshortcuts="H">
      <b>键盘驾驶 · {automatic ? 'C2 自动挡' : 'C1 手动挡'}</b>
      <span><kbd>H</kbd> {expanded ? '收起说明' : '展开说明'}</span>
    </button>
    {expanded ? <div id="driving-help-details" className="instruction-details">
      <div><h3>行驶与转向</h3><p><kbd>W / ↑</kbd> 普通按住保持部分油门；快速双击后持续按住，渐进增加到全油门</p><p><kbd>1–9</kbd> 按住固定 10%–90% 油门（例如 1=10%、8=80%）</p><p><kbd>S / ↓</kbd> 渐进刹车；与油门同时按下时制动优先</p><p><kbd>A / D</kbd> 或 <kbd>← / →</kbd> 转向：轻点微调，按住加快</p><p><kbd>J</kbd> 按住回正（也可 A + D）</p><small>W 的普通按住用于稳定小油门，双击后持续按住用于快速加速；需要精确开度时可直接按 1–9。数字键油门与方向盘踏板最终进入同一 0–100% 模拟量链路。前进超过约 5.4 km/h 时松键自动回正；低速、倒车保留方向。低速可连续轻点刹车；约 9 km/h 以上双击急刹。</small></div>
      <div><h3>起步与换挡</h3><p><kbd>T</kbd> 安全带　<kbd>I</kbd> 点火　<kbd>Space</kbd> 手刹</p>{automatic ? <p><kbd>G</kbd> 前进 D　<kbd>N</kbd> 空挡　<kbd>R</kbd> 倒挡</p> : <><p><kbd>[ / ]</kbd> 逐级降 / 升挡</p><p><kbd>N</kbd> 空挡　<kbd>R</kbd> 倒挡　<kbd>C</kbd> 按住踩死离合</p><p><kbd>Shift</kbd> 半联动保持，轻点 W / S 微调</p><small>半联动保持仅固定离合位置，车速仍需自己控制。换挡仍需操作离合；C 取消半联动。逐级降挡止于空挡，倒挡需单独按 R。</small></>}</div>
      <div><h3>灯光与观察</h3><p><kbd>Q / E</kbd> 左 / 右转向灯　<kbd>V</kbd> 双闪</p><p><kbd>L</kbd> 近光　<kbd>K</kbd> 远光　<kbd>B</kbd> 按住鸣笛</p><p><kbd>Z / X</kbd> 按住左 / 右观察　<kbd>F</kbd> 按住回头</p><p><kbd>M</kbd> 切换四种视角</p></div>
    </div> : <span className="instruction-summary">W/S 油门刹车 · A/D 转向 · J 回正</span>}
  </section>
}

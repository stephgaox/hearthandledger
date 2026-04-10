import { useEffect, useRef, useState } from 'react'

// 20 swatches across 5 warm-earthy hue families —
// browns · greens · terracottas · golds · muted cool-warm accents
export const PRESET_COLORS = [
  // Warm browns / siennas
  '#a67c52', '#b3906f', '#8d6e4c', '#7a5c3a',
  // Forest / olive greens
  '#4a7c59', '#6b7a3e', '#3e6b52', '#5a7050',
  // Terracotta / crimson
  '#c05a30', '#b54a35', '#9a4848', '#c07830',
  // Golds / ambers
  '#b88820', '#b07030', '#c07038', '#a08030',
  // Muted cool-warm (plum · teal · slate · navy)
  '#8a5478', '#3a8078', '#5e6878', '#5a7a9a',
]

export default function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-6 h-6 rounded-full border-2 border-surface-card shadow-sm ring-1 ring-surface-border transition-transform hover:scale-110"
        style={{ backgroundColor: value }}
        title="Change color"
      />
      {open && (
        <div className="absolute z-50 left-0 top-8 bg-surface-card rounded-xl shadow-xl border border-surface-border p-3 w-48">
          <div className="grid grid-cols-4 gap-1.5 mb-2">
            {PRESET_COLORS.map(c => (
              <button key={c} onClick={() => { onChange(c); setOpen(false) }}
                className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${value === c ? 'ring-2 ring-offset-1 ring-primary scale-110' : ''}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-surface-border">
            <span className="text-xs text-text-muted">Custom:</span>
            <input type="color" value={value} onChange={e => onChange(e.target.value)}
              className="w-8 h-6 rounded cursor-pointer border-0 p-0" />
          </div>
        </div>
      )}
    </div>
  )
}

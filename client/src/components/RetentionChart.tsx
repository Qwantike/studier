import { useId, useState } from 'react'
import { retention } from '../../../shared/reviewModel'
import './reviews.css'
import type { Memory } from '../api/reviews'
export default function RetentionChart({ memory }: { memory: Memory }) {
  const [days, setDays] = useState(30),
    id = useId()
  if (memory.retention === null || !memory.stability_days) return null
  const points = Array.from({ length: 121 }, (_, i) => {
    const day = (i / 120) * days
    return `${i ? 'L' : 'M'}${(60 + (day / days) * 436).toFixed(2)} ${(150 - memory.retention! * retention(day, memory.stability_days!) * 120).toFixed(2)}`
  }).join(' ')
  return (
    <div className="mt-4">
      <label htmlFor={id} className="text-xs text-zinc-500">
        Sans nouvelle révision, projection sur{' '}
      </label>
      <select
        id={id}
        value={days}
        onChange={(e) => setDays(Number(e.target.value))}
        className="rounded border bg-transparent p-1 text-xs dark:border-zinc-700"
      >
        {[7, 30, 90].map((d) => (
          <option key={d} value={d}>
            {d} jours
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 520 185"
        role="img"
        aria-label={`Projection estimée : ${Math.round(memory.retention * 100)} % aujourd’hui, ${Math.round(memory.retention * retention(days, memory.stability_days) * 100)} % dans ${days} jours sans révision.`}
        className="retention-chart mt-2 w-full text-zinc-600 dark:text-zinc-300"
      >
        {[0, 20, 40, 60, 80, 100].map((p) => (
          <g key={p}>
            <path
              d={`M60 ${150 - p * 1.2}H496`}
              fill="none"
              stroke="currentColor"
              opacity="0.15"
            />
            <text
              x="52"
              y={154 - p * 1.2}
              textAnchor="end"
              fill="currentColor"
              fontSize="10"
            >
              {p}%
            </text>
          </g>
        ))}
        <path d="M60 54H496" stroke="#d97706" strokeDasharray="5 4" />
        <text x="494" y="48" textAnchor="end" fill="#d97706" fontSize="10">
          Seuil de rappel 80 %
        </text>
        <path d={points} fill="none" stroke="#818cf8" strokeWidth="2.5" />
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <text
            key={f}
            className={f === 0.25 || f === 0.75 ? 'minor-tick' : undefined}
            x={60 + f * 436}
            y="174"
            textAnchor="middle"
            fill="currentColor"
            fontSize="10"
          >
            {f === 0 ? 'Aujourd’hui' : `+${Math.round(f * days)} j`}
          </text>
        ))}
      </svg>
    </div>
  )
}

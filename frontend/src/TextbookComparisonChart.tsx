import { useId, useState } from 'react'
import type { TextbookComparisonData } from './data/curriculum'

type Pair = TextbookComparisonData['comparisons'][number]
type ComparablePair = Pair & { gain_difference: number }

const number = new Intl.NumberFormat('ru-RU')
const signed = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, signDisplay: 'exceptZero' })
const pairName = (pair: Pair) => `${pair.left_textbook_id} / ${pair.right_textbook_id}`
const pairKey = (pair: Pair) => JSON.stringify([pair.left_textbook_id, pair.right_textbook_id])

function ComparisonBar({ pair, limit }: { pair: ComparablePair; limit: number }) {
  const [pinned, setPinned] = useState(false)
  const descriptionId = useId()
  const difference = pair.gain_difference
  const higher = difference > 0 ? pair.left_textbook_id : pair.right_textbook_id
  const percent = difference / limit * 50
  const displayedDifference = difference !== 0 && Math.abs(difference) < 0.005
    ? `${difference > 0 ? '+' : '−'}<0,01`
    : signed.format(difference)

  return <li>
    <button
      type="button"
      className="comparison-chart-row"
      aria-describedby={descriptionId}
      aria-pressed={pinned}
      onClick={() => setPinned(!pinned)}
      onKeyDown={event => { if (event.key === 'Escape') setPinned(false) }}
    >
      <span className="comparison-chart-labels">
        <strong>{pairName(pair)}</strong>
        <span>
          <b>{displayedDifference}</b>
          <span className="comparison-chart-higher">{difference === 0 ? 'Одинаковый прирост' : `Выше в группе ${higher}`}</span>
        </span>
      </span>
      <span className="comparison-chart-track" aria-hidden="true">
        <span
          className={`comparison-chart-bar ${difference < 0 ? 'comparison-chart-negative' : ''} ${difference === 0 ? 'comparison-chart-zero' : ''}`}
          style={{ left: `${50 + Math.min(0, percent)}%`, width: `${Math.abs(percent)}%` }}
        />
      </span>
      <span className="comparison-chart-counts" id={descriptionId} aria-hidden="true">
        <span>{pair.left_textbook_id} · {number.format(pair.left_student_count)} уч.</span>
        <span>{pair.right_textbook_id} · {number.format(pair.right_student_count)} уч.</span>
      </span>
    </button>
  </li>
}

export default function TextbookComparisonChart({ comparisons }: { comparisons: Pair[] }) {
  if (!comparisons.length) return null

  const comparable: ComparablePair[] = []
  const insufficient: Pair[] = []
  let limit = 1
  for (const pair of comparisons) {
    if (pair.status === 'ok' && pair.gain_difference !== null) {
      comparable.push({ ...pair, gain_difference: pair.gain_difference })
      limit = Math.max(limit, Math.ceil(Math.abs(pair.gain_difference)))
    } else {
      insufficient.push(pair)
    }
  }

  return <section className="comparison-chart" aria-labelledby="comparison-chart-title">
    <h2 id="comparison-chart-title">Разница в приросте, баллы</h2>
    <p className="comparison-chart-note">
      Сопоставимые группы. Разница — левый учебник минус правый. Размеры групп показаны под каждой строкой; нажмите, чтобы выделить сравнение.
    </p>
    {comparable.length > 0 && <>
      <div className="comparison-chart-scale" aria-hidden="true">
        <span>{signed.format(-limit)}</span><span>0</span><span>{signed.format(limit)}</span>
      </div>
      <ul className="comparison-chart-pairs">
        {comparable.map(pair => <ComparisonBar key={pairKey(pair)} pair={pair} limit={limit} />)}
      </ul>
    </>}
    {insufficient.length > 0 && <ul className="comparison-chart-missing" aria-label="Пары без результата">
      {insufficient.map(pair => <li key={pairKey(pair)}>
        <strong>{pairName(pair)}</strong>
        <span>{pair.status === 'insufficient_data' ? 'Недостаточно сопоставимых данных' : 'Нет данных о разнице'}</span>
      </li>)}
    </ul>}
  </section>
}

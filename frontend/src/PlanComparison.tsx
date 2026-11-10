import { useState } from 'react'
import type { PlanData } from './data/curriculum'

export function comparisonRows(automatic: PlanData, scenario: PlanData | null) {
  const manual = new Map(scenario?.items.map(item => [item.topic_id, item.proposed_hours]))
  return automatic.items.map(item => ({ id: item.topic_id, name: item.topic_name, current: item.current_hours, automatic: item.proposed_hours, manual: manual.get(item.topic_id) ?? null }))
}

export default function PlanComparison({ automatic, scenario, focusTopic }: { automatic: PlanData; scenario: PlanData | null; focusTopic?: string }) {
  const [onlyChanges, setOnlyChanges] = useState(true)
  const rows = comparisonRows(automatic, scenario)
  const visible = rows.filter(row => !onlyChanges || row.id === focusTopic || row.current !== row.automatic || row.manual !== null && row.manual !== row.automatic)
  const automaticCount = rows.filter(row => row.current !== row.automatic).length
  const manualCount = rows.filter(row => row.manual !== null && row.manual !== row.automatic).length
  return <section className="plan-comparison" aria-labelledby="plan-comparison-title">
    <div className="section-heading"><h2 id="plan-comparison-title">Текущий → Автоматический → Мой вариант</h2><label className="changes-toggle"><input type="checkbox" checked={onlyChanges} onChange={event => setOnlyChanges(event.target.checked)} />Только изменённые темы</label></div>
    <p className="sample-note">Тем с изменениями в автоматическом плане: {automaticCount}. {scenario ? `Тем с вашей правкой относительно автоматического плана: ${manualCount}.` : 'Создайте «Мой вариант» в форме «Что если?» — его часы появятся в третьем столбце.'} Выбранная тема показана даже без изменений.</p>
    <div className="table-scroll" role="region" aria-label="Сравнение трёх планов" tabIndex={0}><table className="plan-compare-table"><caption>Все значения — учебные часы. Текущий план — исходный план набора.</caption>
      <thead><tr><th scope="col">Тема</th><th scope="col">Текущий</th><th scope="col">Автоматический</th><th scope="col">Мой вариант</th><th scope="col">Моя правка к автоматическому</th></tr></thead>
      <tbody>{visible.map(row => <tr key={row.id} className={row.id === focusTopic ? 'focused-topic' : ''}><th scope="row">{row.id} · {row.name}</th><td>{row.current}</td><td>{row.automatic}<small>{row.automatic - row.current > 0 ? '+' : ''}{row.automatic - row.current} к текущему</small></td><td>{row.manual ?? '—'}</td><td>{row.manual === null ? '—' : `${row.manual - row.automatic > 0 ? '+' : ''}${row.manual - row.automatic}`}</td></tr>)}</tbody>
      <tfoot><tr><th scope="row">Общий бюджет</th><td>{automatic.current_total_hours}</td><td>{automatic.proposed_total_hours}</td><td>{scenario?.proposed_total_hours ?? '—'}</td><td>{scenario ? scenario.proposed_total_hours - automatic.proposed_total_hours : '—'}</td></tr></tfoot>
    </table></div>
    {!visible.length && <p className="sample-note">В этих планах нет изменённых тем.</p>}
  </section>
}

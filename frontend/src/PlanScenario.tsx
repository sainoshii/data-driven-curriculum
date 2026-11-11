import { useState, type FormEvent } from 'react'
import type { PlanData, TransferRequest } from './data/curriculum'

export interface ScenarioState {
  automaticPlanId: string
  plan: PlanData
  change: TransferRequest & { fromBefore: number; fromAfter: number; toBefore: number; toAfter: number }
}

export function ScenarioChange({ scenario }: { scenario: ScenarioState }) {
  const change = scenario.change
  const names = new Map(scenario.plan.items.map(item => [item.topic_id, item.topic_name]))
  return <div className="scenario-feedback" role="status"><div className="manual-transfer-route"><span><small>Тема-источник · {change.from_topic_id}</small><strong>{names.get(change.from_topic_id)}</strong><b>{change.fromBefore} → {change.fromAfter} ч</b></span><span className="manual-transfer-hours">{change.hours} ч →</span><span><small>Тема-получатель · {change.to_topic_id}</small><strong>{names.get(change.to_topic_id)}</strong><b>{change.toBefore} → {change.toAfter} ч</b></span></div><div className="table-scroll" role="region" aria-label="Часы до и после переноса" tabIndex={0}>
    <table className="scenario-change"><caption>Последний перенос методиста · {change.hours} ч · Общий бюджет {scenario.plan.proposed_total_hours} ч</caption>
      <thead><tr><th scope="col">Тема</th><th scope="col">До, ч</th><th scope="col">После, ч</th></tr></thead>
      <tbody><tr className="last-changed"><th scope="row">{change.from_topic_id} · {names.get(change.from_topic_id)}</th><td>{change.fromBefore}</td><td>{change.fromAfter}</td></tr><tr className="last-changed"><th scope="row">{change.to_topic_id} · {names.get(change.to_topic_id)}</th><td>{change.toBefore}</td><td>{change.toAfter}</td></tr></tbody>
    </table>
  </div></div>
}

export default function PlanScenario({ plan, scenario, busy, error, onTransfer, onRestore, showChange = true }: {
  plan: PlanData
  scenario: ScenarioState | null
  busy: boolean
  error: string | null
  onTransfer: (transfer: TransferRequest) => void
  onRestore: () => void
  showChange?: boolean
}) {
  const [from, setFrom] = useState(plan.items[0]?.topic_id ?? '')
  const [to, setTo] = useState(plan.items[1]?.topic_id ?? '')
  const [hours, setHours] = useState('1')
  const [validation, setValidation] = useState<string | null>(null)
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const count = Number(hours)
    if (!from || !to || from === to) { setValidation('Выберите две разные темы.'); return }
    if (!Number.isSafeInteger(count) || count < 1) { setValidation('Укажите положительное целое число часов.'); return }
    setValidation(null)
    onTransfer({ from_topic_id: from, to_topic_id: to, hours: count })
  }
  return <section className="scenario-panel" aria-labelledby="scenario-title">
    <div className="section-heading"><h2 id="scenario-title">Что если?</h2><span>{scenario ? 'На экране: ручной вариант' : 'На экране: автоматический план'}</span></div>
    <p className="sample-note">Перенесите часы между темами текущего варианта. Сервер проверит минимумы и максимумы учебного плана.</p>
    <form onSubmit={submit}><fieldset disabled={busy}><legend className="sr-only">Ручной перенос часов</legend><div className="scenario-fields">
      <label>Откуда<select aria-label="Откуда" value={from} onChange={event => setFrom(event.target.value)}>{plan.items.map(item => <option key={item.topic_id} value={item.topic_id}>{item.topic_id} · {item.topic_name} ({item.proposed_hours} ч)</option>)}</select></label>
      <label>Куда<select aria-label="Куда" value={to} onChange={event => setTo(event.target.value)}>{plan.items.map(item => <option key={item.topic_id} value={item.topic_id}>{item.topic_id} · {item.topic_name} ({item.proposed_hours} ч)</option>)}</select></label>
      <label>Число часов<input type="number" aria-label="Число часов" min="1" step="1" required value={hours} onChange={event => setHours(event.target.value)} /></label>
    </div><div className="scenario-actions"><button className="primary-button" type="submit" disabled={plan.items.length < 2}>Перенести</button><button className="secondary-button" type="button" disabled={!scenario} onClick={() => { setValidation(null); onRestore() }}>Вернуться к автоматическому плану</button></div></fieldset></form>
    {!showChange && <p className="scenario-save-status" role="status">{scenario ? `Сохранено: ${scenario.change.from_topic_id} ${scenario.change.fromBefore} → ${scenario.change.fromAfter} ч · ${scenario.change.to_topic_id} ${scenario.change.toBefore} → ${scenario.change.toAfter} ч. Бюджет ${scenario.plan.proposed_total_hours} ч.` : `Текущий бюджет ${plan.proposed_total_hours} ч. Перенос изменит две темы, сохранив общую сумму.`}</p>}
    {(validation || error) && <div className="error-message" role="alert"><p>{validation || error}</p><p>Текущий вариант сохранён. Исправьте перенос и повторите попытку.</p></div>}
    {scenario && showChange && <ScenarioChange scenario={scenario} />}
  </section>
}

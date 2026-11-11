import { useState, type FormEvent } from 'react'
import { curriculumApi, type Dataset, type PlanData } from './data/curriculum'
import './school-plan-comparison.css'

const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })

function SchoolPlanCard({ plan }: { plan: PlanData }) {
  const items = new Map(plan.items.map(item => [item.topic_id, item]))

  return <article className="school-plan-card" aria-label={`План школы ${plan.school_id}`}>
    <header>
      <h3>Школа {plan.school_id}</h3>
      <p>Бюджет <strong>{number.format(plan.current_total_hours)} → {number.format(plan.proposed_total_hours)} ч</strong></p>
    </header>
    {plan.transfers.length ? <ul className="school-plan-routes">
      {plan.transfers.map(transfer => (
        <li key={`${transfer.from_topic_id}:${transfer.to_topic_id}`}>
          <strong className="school-plan-hours">Перенос {number.format(transfer.hours)} ч</strong>
          <dl>
            {[
              { label: 'Откуда', id: transfer.from_topic_id },
              { label: 'Куда', id: transfer.to_topic_id },
            ].map(({ label, id }) => {
              const item = items.get(id)
              const below = item?.scores.below_threshold_pct
              return <div key={id}>
                <dt>{label}</dt>
                <dd>{item?.topic_name ?? id}</dd>
                {item && below != null && <dd className="school-plan-evidence">
                  {number.format(below)}% ниже {plan.mastery_threshold} баллов · выборка {number.format(item.scores.result_count)}
                </dd>}
              </div>
            })}
          </dl>
        </li>
      ))}
    </ul> : <p className="school-plan-empty">{plan.explanation}</p>}
  </article>
}

export default function SchoolPlanComparison({ dataset }: { dataset: Dataset }) {
  const [firstSchool, setFirstSchool] = useState(dataset.school_ids[0])
  const [secondSchool, setSecondSchool] = useState(dataset.school_ids[dataset.school_ids.length - 1])
  const [plans, setPlans] = useState<[PlanData, PlanData] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sameSchool = firstSchool === secondSchool

  async function compare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading || sameSchool) return

    setPlans(null)
    setError(null)
    setLoading(true)
    try {
      const result = await Promise.all([
        curriculumApi.createPlan(dataset.dataset_id, firstSchool),
        curriculumApi.createPlan(dataset.dataset_id, secondSchool),
      ])
      setPlans(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось рассчитать планы школ.')
    } finally {
      setLoading(false)
    }
  }

  return <details className="school-plan-comparison">
    <summary>Сравнить планы двух школ</summary>
    <form className="school-plan-form" onSubmit={compare} onChange={() => { setPlans(null); setError(null) }}>
      <label className="school-filter">
        Первая школа
        <select value={firstSchool} onChange={event => setFirstSchool(event.target.value)} disabled={loading}>
          {dataset.school_ids.map(id => <option key={id} value={id}>{id}</option>)}
        </select>
      </label>
      <label className="school-filter">
        Вторая школа
        <select value={secondSchool} onChange={event => setSecondSchool(event.target.value)} disabled={loading}>
          {dataset.school_ids.map(id => <option key={id} value={id}>{id}</option>)}
        </select>
      </label>
      <button className="secondary-button" type="submit" disabled={loading || sameSchool}>Сравнить автопланы</button>
    </form>
    {sameSchool && <p className="school-plan-message" role="status">Выберите две разные школы.</p>}
    {loading && <p className="school-plan-message" role="status">Рассчитываем планы школ…</p>}
    {error && <p className="error-message" role="alert">Не удалось сравнить планы. {error}</p>}
    {plans && <div className="school-plan-results">
      {plans.map(plan => <SchoolPlanCard key={plan.school_id} plan={plan} />)}
    </div>}
  </details>
}

import type { ReactNode } from 'react'
import type { PlanData } from './data/curriculum'
import PlanTransfers from './PlanTransfers'
import { ScenarioChange, type ScenarioState } from './PlanScenario'

const number = new Intl.NumberFormat('ru-RU')

export default function PlanOutcome({ plan, scenario, children }: { plan: PlanData; scenario: ScenarioState | null; children: ReactNode }) {
  const preserved = plan.current_total_hours === plan.proposed_total_hours
  return <section className="plan-outcome" aria-labelledby="outcome-title">
    <div className="outcome-heading"><div><span className="eyebrow">{scenario ? 'ВАШ СЦЕНАРИЙ' : 'РЕЗУЛЬТАТ РАСЧЁТА'}</span><h2 id="outcome-title">{scenario ? 'Ваш вариант сохранён' : plan.status === 'no_changes' ? 'Часы остаются без изменений' : 'План перераспределения готов'}</h2></div><span className={preserved ? 'budget-status' : 'budget-status budget-alert'}>{preserved ? 'Бюджет сохранён' : 'Проверьте бюджет'}</span></div>
    <div className="outcome-budget"><div><span>Общий бюджет до</span><strong>{number.format(plan.current_total_hours)}<small>ч</small></strong></div><span className="budget-arrow" aria-hidden="true">→</span><div><span>Общий бюджет после</span><strong>{number.format(plan.proposed_total_hours)}<small>ч</small></strong></div><p>{plan.explanation}</p></div>
    {children}
    {scenario ? <div className="outcome-transfer"><h3>Последний перенос методиста</h3><ScenarioChange key={plan.plan_id} scenario={scenario} /></div> : <PlanTransfers plan={plan} isManual={false} featured />}
  </section>
}

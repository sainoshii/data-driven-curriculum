import { DatasetBadge } from './DatasetControls'
import MethodistReportButton from './MethodistReport'
import PlanScenario, { type ScenarioState } from './PlanScenario'
import PlanSchoolContext from './PlanSchoolContext'
import PlanComparison from './PlanComparison'
import PlanTransfers from './PlanTransfers'
import { useEffect, useRef, useState } from 'react'
import { curriculumApi, type Dataset, type PlanData, type TransferRequest } from './data/curriculum'

const number = new Intl.NumberFormat('ru-RU')
const signed = new Intl.NumberFormat('ru-RU', { signDisplay: 'exceptZero' })

export function planMatchesScope(plan: PlanData, datasetId: string, schoolId: string) {
  return plan.dataset_id === datasetId && plan.school_id === (schoolId || null)
}

export function PlanResult({ plan, isManual = false }: { plan: PlanData; isManual?: boolean }) {
  return <>
    <div className="plan-explanation" role="status"><h3>{plan.status === 'no_changes' ? 'План без изменений' : 'Проект перераспределения готов'}</h3><p>{plan.explanation}</p></div>
    <div className="plan-budget">
      <article className="metric"><h3>Общий бюджет до</h3><strong>{number.format(plan.current_total_hours)}</strong><p>Учебных часов</p></article>
      <article className="metric"><h3>Общий бюджет после</h3><strong>{number.format(plan.proposed_total_hours)}</strong><p>{plan.current_total_hours === plan.proposed_total_hours ? 'Бюджет сохранён' : 'Бюджет изменился — проверьте план'}</p></article>
    </div>
    <PlanTransfers plan={plan} isManual={isManual} />
    {plan.school_id === null && plan.items.some(item => item.delta_hours > 0) && <PlanSchoolContext key={plan.dataset_id} plan={plan} />}
    <section className="plan-section" aria-labelledby="hours-table-title"><h2 id="hours-table-title">Часы и основания по темам</h2>
      <div className="table-scroll" role="region" aria-label="План часов по темам" tabIndex={0}><table className="plan-table"><caption>{plan.items.length} тем · {plan.school_id ?? 'Все школы'}</caption><thead><tr><th scope="col">Тема</th><th scope="col">Было</th><th scope="col">Предложено</th><th scope="col">Изменение</th><th scope="col">Основание</th></tr></thead><tbody>{plan.items.map(item => <tr key={item.topic_id}><th scope="row"><span className="topic-code">{item.topic_id}</span>{item.topic_name}</th><td>{number.format(item.current_hours)}</td><td>{number.format(item.proposed_hours)}</td><td className={item.delta_hours === 0 ? '' : 'hours-changed'}>{signed.format(item.delta_hours)}</td><td>{item.reason}</td></tr>)}</tbody><tfoot><tr><th scope="row">Итого</th><td>{number.format(plan.current_total_hours)}</td><td>{number.format(plan.proposed_total_hours)}</td><td>{signed.format(plan.proposed_total_hours - plan.current_total_hours)}</td><td>Общий бюджет плана</td></tr></tfoot></table></div>
    </section>
    <div className="context-note"><span className="info-mark">i</span><p>Это проект плана для обсуждения методистом. CSV содержит сохранённый сервером снимок этого расчёта.</p></div>
  </>
}

export default function Plan({ dataset, schoolId, plan, scenario, onScenarioChange, invalidated, changingSchool, filterError, onCalculated, onSchoolChange, onRetryFilter, onOverview, focusTopic }: {
  dataset: Dataset | null
  schoolId: string
  plan: PlanData | null
  scenario: ScenarioState | null
  onScenarioChange: (scenario: ScenarioState | null) => void
  invalidated: boolean
  changingSchool: boolean
  filterError: string | null
  onCalculated: (plan: PlanData) => void
  onSchoolChange: (id: string) => void
  onRetryFilter: () => void
  onOverview: () => void
  focusTopic?: string
}) {
  const [calculating, setCalculating] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [transferring, setTransferring] = useState(false)
  const [transferError, setTransferError] = useState<string | null>(null)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const automaticPlan = dataset && plan && planMatchesScope(plan, dataset.dataset_id, schoolId) ? plan : null
  const currentScenario = automaticPlan && scenario?.automaticPlanId === automaticPlan.plan_id && planMatchesScope(scenario.plan, automaticPlan.dataset_id, schoolId) ? scenario : null
  const currentPlan = currentScenario?.plan ?? automaticPlan

  async function transfer(transfer: TransferRequest) {
    if (!currentPlan || !automaticPlan || calculating || downloading || transferring || changingSchool) return
    setTransferring(true)
    setError(null)
    setTransferError(null)
    setDownloadError(null)
    try {
      const result = await curriculumApi.transferPlanHours(currentPlan.dataset_id, currentPlan.plan_id, transfer)
      if (active.current) onScenarioChange({ automaticPlanId: automaticPlan.plan_id, plan: result, change: {
        ...transfer,
        fromBefore: currentPlan.items.find(item => item.topic_id === transfer.from_topic_id)!.proposed_hours,
        toBefore: currentPlan.items.find(item => item.topic_id === transfer.to_topic_id)!.proposed_hours,
        fromAfter: result.items.find(item => item.topic_id === transfer.from_topic_id)!.proposed_hours,
        toAfter: result.items.find(item => item.topic_id === transfer.to_topic_id)!.proposed_hours,
      } })
    } catch (reason) {
      if (active.current) setTransferError(reason instanceof Error ? reason.message : 'Не удалось перенести часы.')
    } finally { if (active.current) setTransferring(false) }
  }

  async function calculate() {
    if (!dataset || calculating || downloading || transferring || changingSchool) return
    setCalculating(true)
    setError(null)
    setDownloadError(null)
    setTransferError(null)
    try {
      const result = await curriculumApi.createPlan(dataset.dataset_id, schoolId || undefined)
      if (active.current) onCalculated(result)
    } catch (reason) {
      if (active.current) setError(reason instanceof Error ? reason.message : 'Не удалось рассчитать план.')
    } finally { if (active.current) setCalculating(false) }
  }

  async function download() {
    if (!currentPlan || calculating || downloading || transferring || changingSchool) return
    setDownloading(true)
    setDownloadError(null)
    try {
      const blob = await curriculumApi.exportPlan(currentPlan.dataset_id, currentPlan.plan_id)
      if (!active.current) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `plan-${currentPlan.school_id ?? 'all'}-${currentScenario ? 'scenario' : 'automatic'}.csv`
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (reason) {
      if (active.current) setDownloadError(reason instanceof Error ? reason.message : 'Не удалось скачать CSV.')
    } finally { if (active.current) setDownloading(false) }
  }

  if (!dataset) return <section className="empty-state placeholder"><h2>Сначала откройте набор данных</h2><p>Откройте демо на «Обзоре», затем вернитесь к плану часов.</p><button className="secondary-button" onClick={onOverview}>Перейти к обзору</button></section>

  return <section aria-label="Проект плана часов" aria-busy={calculating || changingSchool || transferring}>
    <div className="overview-toolbar"><div><h2>Перераспределение учебных часов</h2><p>Проект плана с основаниями каждого изменения</p></div><div className="overview-controls"><DatasetBadge dataset={dataset} /><label className="school-filter">Школа<select aria-label="Школа" value={schoolId} disabled={changingSchool || calculating || downloading || transferring} onChange={event => onSchoolChange(event.target.value)}><option value="">Все школы</option>{dataset.school_ids.map(id => <option key={id} value={id}>{id}</option>)}</select></label></div></div>
    {filterError && <div className="error-message" role="alert"><p>{filterError}</p><button className="secondary-button" disabled={changingSchool || calculating || downloading || transferring} onClick={onRetryFilter}>Повторить смену школы</button></div>}
    {focusTopic && <p className="topic-focus-note">Вы разбираете тему <strong>{focusTopic}</strong>. После расчёта её строка выделена в сравнении планов. Бюджет относится ко всему учебному плану.</p>}
    <div className="plan-actions"><button className="primary-button" disabled={calculating || downloading || changingSchool || transferring} onClick={calculate}>{calculating ? 'Рассчитываем…' : currentPlan ? 'Пересчитать план' : 'Рассчитать план'}</button><button className="secondary-button" disabled={!currentPlan || calculating || downloading || changingSchool || transferring} onClick={download}>{downloading ? 'Скачиваем…' : 'Скачать CSV'}</button><MethodistReportButton dataset={dataset} automatic={automaticPlan} manual={currentScenario?.plan ?? null} topicId={focusTopic} disabled={!currentPlan || calculating || downloading || changingSchool || transferring} /></div>
    {(calculating || changingSchool) && <p className="loading-message" role="status">{changingSchool ? 'Обновляем школу…' : 'Рассчитываем проект плана…'}</p>}
    {error && <div className="error-message" role="alert"><p>{error}</p><button className="secondary-button" onClick={calculate} disabled={calculating || downloading || transferring || changingSchool}>Повторить расчёт</button></div>}
    {downloadError && <div className="error-message" role="alert"><p>{downloadError}</p><button className="secondary-button" onClick={download} disabled={calculating || downloading || transferring || changingSchool}>Повторить скачивание</button></div>}
    {transferring && <p className="loading-message" role="status">Сохраняем вариант плана…</p>}
    {!changingSchool && currentPlan && <PlanScenario key={automaticPlan!.plan_id} plan={currentPlan} scenario={currentScenario} busy={calculating || downloading || transferring} error={transferError} onTransfer={transfer} onRestore={() => { onScenarioChange(null); setTransferError(null); setDownloadError(null) }} />}
    {!changingSchool && automaticPlan && <PlanComparison automatic={automaticPlan} scenario={currentScenario?.plan ?? null} focusTopic={focusTopic} />}
    {!changingSchool && (currentPlan ? <PlanResult plan={currentPlan} isManual={currentScenario !== null} /> : <section className="empty-state"><h2>{invalidated ? 'Школа изменилась — нужен новый расчёт' : 'План ещё не рассчитан'}</h2><p>Рассчитайте план для среза «{schoolId || 'Все школы'}». После расчёта появятся часы, основания переносов и CSV.</p></section>)}
  </section>
}

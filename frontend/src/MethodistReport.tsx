import { useEffect, useState } from 'react'
import { curriculumApi, type Dataset, type OverviewData, type PlanData, type TextbookComparisonData } from './data/curriculum'

const STORAGE_PREFIX = 'methodist-report:'
const decimal = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
const signed = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, signDisplay: 'exceptZero' })
const value = (n: number | null) => n === null ? 'Нет данных' : decimal.format(n)
const percent = (n: number | null) => n === null ? 'Нет данных' : `${value(n)}%`

export interface ReportSnapshot {
  dataset: Dataset
  automatic: PlanData
  manual: PlanData | null
  topicId: string
  createdAt: string
}

export function reportBudgets(snapshot: ReportSnapshot) {
  const original = snapshot.automatic.items.reduce((sum, item) => sum + item.current_hours, 0)
  const automatic = snapshot.automatic.items.reduce((sum, item) => sum + item.proposed_hours, 0)
  const manual = snapshot.manual?.items.reduce((sum, item) => sum + item.proposed_hours, 0) ?? null
  const consistent = original === snapshot.automatic.current_total_hours && automatic === snapshot.automatic.proposed_total_hours && original === automatic &&
    (snapshot.manual === null || manual === snapshot.manual.proposed_total_hours && snapshot.manual.current_total_hours === original && manual === original)
  return { original, automatic, manual, consistent }
}

export function validReportScope(snapshot: ReportSnapshot) {
  return snapshot.dataset.dataset_id === snapshot.automatic.dataset_id &&
    (!snapshot.manual || snapshot.manual.dataset_id === snapshot.automatic.dataset_id && snapshot.manual.school_id === snapshot.automatic.school_id)
}

function Reasons({ plan, baseline }: { plan: PlanData; baseline?: PlanData }) {
  const base = new Map(baseline?.items.map(item => [item.topic_id, item.proposed_hours]))
  const changed = plan.items.filter(item => baseline ? item.proposed_hours !== base.get(item.topic_id) : item.delta_hours !== 0)
  const names = new Map(plan.items.map(item => [item.topic_id, item.topic_name]))
  return <>
    <p>{plan.explanation}</p>
    <p className="report-plan-id">Сохранённый план: {plan.plan_id}</p>
    {plan.transfers.length ? <ul>{plan.transfers.map((transfer, index) => <li key={index}>{transfer.from_topic_id} · {names.get(transfer.from_topic_id) ?? 'Тема'} → {transfer.to_topic_id} · {names.get(transfer.to_topic_id) ?? 'Тема'}: <strong>{transfer.hours} ч</strong></li>)}</ul> : <p>Переносов часов нет.</p>}
    {baseline && <p className="report-note">Выше — полный список переносов сохранённого варианта; ниже — основания тем, чьи итоговые часы отличаются от автоматического плана.</p>}
    {changed.length ? <dl className="report-reasons">{changed.map(item => <div key={item.topic_id}><dt>{item.topic_id} · {item.topic_name}</dt><dd>{item.reason}</dd></div>)}</dl> : <p>Часы относительно {baseline ? 'автоматического' : 'исходного'} плана не изменены.</p>}
  </>
}

export function MethodistReportDocument({ snapshot, overview, comparison, comparisonError }: {
  snapshot: ReportSnapshot; overview: OverviewData; comparison: TextbookComparisonData | null; comparisonError: string | null
}) {
  const { dataset, automatic, manual } = snapshot
  const budgets = reportBudgets(snapshot)
  const manualItems = new Map(manual?.items.map(item => [item.topic_id, item]))
  const topic = automatic.items.find(item => item.topic_id === snapshot.topicId)
  return <article className="methodist-report" lang="ru">
    <header><p className="report-kicker">DATA-DRIVEN CURRICULUM</p><h1>Отчёт для методиста</h1>
      <dl className="report-metadata"><div><dt>Школа</dt><dd>{automatic.school_id ?? `Все школы (${dataset.school_ids.join(', ')})`}</dd></div><div><dt>Набор данных</dt><dd>{dataset.is_demo ? 'Демонстрационный набор' : 'Загруженный CSV-набор'}<br /><code>{dataset.dataset_id}</code></dd></div><div><dt>Сформирован</dt><dd>{new Date(snapshot.createdAt).toLocaleString('ru-RU')}</dd></div><div><dt>Вариант на экране</dt><dd>{manual ? 'Ручной сценарий' : 'Автоматический план'}</dd></div></dl>
      {dataset.is_demo && <p className="report-synthetic">Синтетические демонстрационные данные. Не являются реальными результатами школьников.</p>}
      <p className="report-note">Снимок рассчитанных планов на момент открытия отчёта. Изменения в рабочей панели не меняют этот документ.</p>
    </header>
    <section><h2>1. Три сложные темы</h2><p>Срез: {automatic.school_id ?? 'все школы'}. Ученики: {value(overview.student_count)}. Результаты (пары ученик–тема): {value(overview.scores.result_count)}. Порог освоения: {value(overview.mastery_threshold)} баллов.</p>
      {overview.hardest_topics.length ? <table><thead><tr><th scope="col">Тема</th><th scope="col">Ниже порога</th><th scope="col">Средний итоговый балл</th><th scope="col">Результаты</th></tr></thead><tbody>{[...overview.hardest_topics].sort((a, b) => (b.scores.below_threshold_pct ?? -1) - (a.scores.below_threshold_pct ?? -1) || a.topic_id.localeCompare(b.topic_id)).slice(0, 3).map(item => <tr key={item.topic_id}><th scope="row">{item.topic_id} · {item.topic_name}</th><td>{percent(item.scores.below_threshold_pct)}</td><td>{value(item.scores.post_score_avg)}</td><td>{value(item.scores.result_count)}</td></tr>)}</tbody></table> : <p>Нет результатов для определения сложных тем.</p>}
    </section>
    <section><h2>2. Сравнение учебников</h2>
      <p>Выбранная тема: {snapshot.topicId ? `${snapshot.topicId}${topic ? ` · ${topic.topic_name}` : ''}` : 'не выбрана'}. Срез тот же, что у плана.</p>
      {comparisonError && <p className="report-warning">Сравнение не включено: {comparisonError}</p>}
      {!snapshot.topicId && <p>Тема для сравнения не выбрана. Выберите тему в рабочей панели и откройте новый отчёт.</p>}
      {comparison && <>
        {comparison.groups.length ? <table><caption>Сводка по учебникам</caption><thead><tr><th scope="col">Учебник</th><th scope="col">Ученики</th><th scope="col">Входной балл</th><th scope="col">Итоговый балл</th><th scope="col">Прирост, баллы</th></tr></thead><tbody>{comparison.groups.map(group => <tr key={group.textbook_id}><th scope="row">{group.textbook_id}</th><td>{value(group.student_count)}</td><td>{value(group.pre_score_avg)}</td><td>{value(group.post_score_avg)}</td><td>{signed.format(group.gain_avg)}</td></tr>)}</tbody></table> : <p>По выбранной теме нет результатов для сравнения учебников.</p>}
        {comparison.comparisons.length > 0 && <table><caption>Попарная наблюдаемая разница прироста: левый минус правый</caption><thead><tr><th scope="col">Левый / правый</th><th scope="col">Разница, баллы</th><th scope="col">Сопоставимые ученики слева</th><th scope="col">Справа</th></tr></thead><tbody>{comparison.comparisons.map(pair => <tr key={`${pair.left_textbook_id}:${pair.right_textbook_id}`}><th scope="row">{pair.left_textbook_id} / {pair.right_textbook_id}</th><td>{pair.status === 'insufficient_data' ? 'Недостаточно сопоставимых данных' : pair.gain_difference === null ? 'Нет данных' : signed.format(pair.gain_difference)}</td><td>{value(pair.left_student_count)}</td><td>{value(pair.right_student_count)}</td></tr>)}</tbody></table>}
        <p className="report-note">Это наблюдаемые различия между группами, а не доказательство влияния учебника. Сопоставление учитывает школу и диапазон входного балла; размеры сопоставимых выборок отличаются от общего числа учеников.</p>
      </>}
    </section>
    <section><h2>3. Бюджет и три варианта плана</h2>
      <p className={budgets.consistent ? 'report-budget-ok' : 'report-warning'}>{budgets.consistent ? 'Общий бюджет сохранён во всех созданных вариантах.' : 'Обнаружено расхождение бюджета: проверьте суммы и данные плана.'}</p>
      <dl className="report-budgets"><div><dt>Исходный</dt><dd>{value(budgets.original)} ч</dd></div><div><dt>Автоматический</dt><dd>{value(budgets.automatic)} ч</dd></div><div><dt>Ручной</dt><dd>{budgets.manual === null ? 'Не создан' : `${value(budgets.manual)} ч`}</dd></div></dl>
      {!manual && <p>Ручной вариант не создан. Столбец ручного плана не содержит предположительных значений.</p>}
      <table className="report-hours"><caption>Часы по всем темам. Ручная правка — разница относительно автоматического плана.</caption><thead><tr><th scope="col">Тема</th><th scope="col">Исходный</th><th scope="col">Авто</th><th scope="col">Ручной</th><th scope="col">Ручная правка</th></tr></thead><tbody>{automatic.items.map(item => {
        const manualItem = manualItems.get(item.topic_id)
        return <tr key={item.topic_id}><th scope="row">{item.topic_id} · {item.topic_name}</th><td>{value(item.current_hours)}</td><td>{value(item.proposed_hours)}</td><td>{manualItem ? value(manualItem.proposed_hours) : '—'}</td><td>{manualItem ? signed.format(manualItem.proposed_hours - item.proposed_hours) : '—'}</td></tr>
      })}</tbody><tfoot><tr><th scope="row">Итого</th><td>{value(budgets.original)}</td><td>{value(budgets.automatic)}</td><td>{budgets.manual === null ? '—' : value(budgets.manual)}</td><td>{budgets.manual === null ? '—' : signed.format(budgets.manual - budgets.automatic)}</td></tr></tfoot></table>
    </section>
    <section><h2>4. Основания и направления переносов</h2><h3>Автоматический план</h3><Reasons plan={automatic} />{manual && <><h3>Ручной вариант</h3><Reasons plan={manual} baseline={automatic} /></>}</section>
    <footer>Проект для обсуждения методистом. Итоговое решение об учебном плане принимает специалист. Data-Driven Curriculum.</footer>
  </article>
}

function readSnapshot(): ReportSnapshot | null {
  try {
    const token = window.location.hash.slice('#/methodist-report/'.length)
    const raw = sessionStorage.getItem(STORAGE_PREFIX + token)
    if (!raw) return null
    const data = JSON.parse(raw) as ReportSnapshot
    if (!data.dataset || !Array.isArray(data.dataset.school_ids) || !Array.isArray(data.automatic?.items) || data.manual && !Array.isArray(data.manual.items) || !validReportScope(data)) return null
    return data
  } catch { return null }
}

export function MethodistReportPage() {
  const [snapshot] = useState(readSnapshot)
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [comparison, setComparison] = useState<TextbookComparisonData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [comparisonError, setComparisonError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    document.body.classList.add('report-document')
    document.title = 'Отчёт для методиста · Data-Driven Curriculum'
    return () => { document.body.classList.remove('report-document') }
  }, [])
  useEffect(() => {
    if (!snapshot) return
    let ignore = false
    setError(null); setReady(false); setOverview(null); setComparison(null); setComparisonError(null)
    const schoolId = snapshot.automatic.school_id ?? undefined
    Promise.allSettled([
      curriculumApi.getOverview(snapshot.dataset.dataset_id, schoolId),
      snapshot.topicId ? curriculumApi.getTextbookComparison(snapshot.dataset.dataset_id, snapshot.topicId, schoolId) : Promise.resolve(null),
    ]).then(([summary, books]) => {
      if (ignore) return
      if (summary.status === 'fulfilled') setOverview(summary.value)
      else setError(summary.reason instanceof Error ? summary.reason.message : 'Не удалось загрузить обзор.')
      if (books.status === 'fulfilled') setComparison(books.value)
      else setComparisonError(books.reason instanceof Error ? books.reason.message : 'Нет ответа сервера.')
      setReady(true)
    })
    return () => { ignore = true }
  }, [snapshot, attempt])
  return <main className="methodist-report-page">
    <div className="report-toolbar"><button disabled={!overview || !ready} onClick={() => window.print()}>Печать / Сохранить в PDF</button><p>В диалоге печати выберите «Сохранить в PDF». Формат — A4.</p>{comparisonError && <button onClick={() => setAttempt(n => n + 1)}>Повторить загрузку сравнения</button>}</div>
    {!snapshot ? <p role="alert" className="report-warning">Снимок отчёта недоступен. Откройте отчёт кнопкой «Отчёт для методиста» в рассчитанном плане.</p> : error ? <div className="report-warning" role="alert"><p>{error}</p><button onClick={() => setAttempt(n => n + 1)}>Повторить загрузку отчёта</button></div> : overview && ready ? <MethodistReportDocument snapshot={snapshot} overview={overview} comparison={comparison} comparisonError={comparisonError} /> : <p role="status">Готовим отчёт по сохранённым планам…</p>}
  </main>
}

export default function MethodistReportButton({ dataset, automatic, manual, topicId, disabled }: { dataset: Dataset; automatic: PlanData | null; manual: PlanData | null; topicId?: string; disabled: boolean }) {
  const [error, setError] = useState<string | null>(null)
  function open() {
    if (!automatic || disabled) return
    setError(null)
    const token = crypto.randomUUID()
    const key = STORAGE_PREFIX + token
    try {
      const snapshot: ReportSnapshot = structuredClone({ dataset, automatic, manual, topicId: topicId ?? '', createdAt: new Date().toISOString() })
      if (!validReportScope(snapshot)) throw new Error('Планы относятся к разным наборам или школам. Откройте актуальный план.')
      sessionStorage.setItem(key, JSON.stringify(snapshot))
      const url = new URL(window.location.href)
      url.hash = `/methodist-report/${token}`
      const popup = window.open(url.href, '_blank')
      if (!popup) throw new Error('Браузер заблокировал окно отчёта. Разрешите всплывающее окно для этого сайта и повторите.')
      popup.opener = null
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось открыть отчёт.') }
    finally { sessionStorage.removeItem(key) }
  }
  return <span className="methodist-report-launcher"><button className="secondary-button" disabled={disabled || !automatic} onClick={open}>Отчёт для методиста</button>{error && <span role="alert">{error}</span>}</span>
}

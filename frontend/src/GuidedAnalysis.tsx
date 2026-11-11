import { useEffect, useState } from 'react'
import { DatasetBadge } from './DatasetControls'
import { curriculumApi, type Dataset, type PlanData, type TopicScores, type TopicsData } from './data/curriculum'

const decimal = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
const display = (value: number | null) => value === null ? 'Нет данных' : decimal.format(value)

export function AnalysisSummary({ topic, threshold, plan }: { topic: TopicScores; threshold: number; plan: PlanData | null }) {
  const item = plan?.items.find(item => item.topic_id === topic.topic_id)
  return <section className="analysis-summary" aria-label="Краткое резюме анализа">
    <span className="eyebrow">ЧТО ПОКАЗЫВАЮТ ДАННЫЕ</span>
    <p>По теме «{topic.topic_name}» {topic.scores.below_threshold_pct === null ? 'нет данных о доле результатов ниже порога' : <><strong>{display(topic.scores.below_threshold_pct)}%</strong> результатов ниже {display(threshold)} баллов</>}. Средний итоговый балл — {display(topic.scores.post_score_avg)}, выборка — {display(topic.scores.result_count)} результатов.</p>
    {item ? <p>Автоматический план: <strong>{item.current_hours} → {item.proposed_hours} ч</strong>. {item.delta_hours > 0 ? `Предлагается добавить ${item.delta_hours} ч.` : item.delta_hours < 0 ? `Предлагается передать ${Math.abs(item.delta_hours)} ч другим темам.` : 'Часы остаются без изменений.'} {item.reason}</p> : <p>Рассчитайте план часов, чтобы увидеть возможные изменения и их основания.</p>}
  </section>
}

export interface UploadReceiptData {
  datasetId: string
  studentCount: number
  schoolCount: number
  topicCount: number
  resultCount: number
  resultsFile: string
  topicsFile: string
}

export function UploadReceipt({ receipt, onStart }: { receipt: UploadReceiptData; onStart: () => void }) {
  return <section className="upload-receipt" aria-labelledby="receipt-title" role="status">
    <span className="eyebrow">НАБОР ГОТОВ К РАБОТЕ</span><h2 id="receipt-title">Файлы загружены</h2>
    <p>{receipt.resultsFile} · {receipt.topicsFile}</p>
    <dl className="receipt-stats"><div><dt>Учеников</dt><dd>{display(receipt.studentCount)}</dd></div><div><dt>Школ</dt><dd>{display(receipt.schoolCount)}</dd></div><div><dt>Тем</dt><dd>{display(receipt.topicCount)}</dd></div><div><dt>Результатов</dt><dd>{display(receipt.resultCount)}</dd></div></dl>
    <p className="sample-note">Весь загруженный набор. Результат — одна пара ученик–тема.</p><button className="primary-button" onClick={onStart}>Начать анализ</button>
  </section>
}

export function DemoGuide({ opened, topicSelected, compared, planned, busy, onDemo, onTopic, onCompare, onPlan }: {
  opened: boolean; topicSelected: boolean; compared: boolean; planned: boolean; busy: boolean
  onDemo: () => void; onTopic: () => void; onCompare: () => void; onPlan: () => void
}) {
  return <details className="demo-guide" open={!opened}>
    <summary>Демо за четыре шага <span>От сложной темы до проекта плана</span></summary>
    <ol><li><span>{opened ? '✓' : '01'}</span><h3>Откройте данные</h3><p>Синтетический набор: математика, 7-й класс.</p><button disabled={busy || opened} onClick={onDemo}>Начать демо</button></li>
      <li><span>{topicSelected ? '✓' : '02'}</span><h3>Найдите сложную тему</h3><p>Посмотрите результат, порог и размер выборки.</p><button disabled={busy || !opened} onClick={onTopic}>Разобрать первую тему</button></li>
      <li><span>{compared ? '✓' : '03'}</span><h3>Сравните учебники</h3><p>Оцените прирост в сопоставимых группах.</p><button disabled={busy || !opened} onClick={onCompare}>Перейти к сравнению</button></li>
      <li><span>{planned ? '✓' : '04'}</span><h3>Проверьте часы</h3><p>Рассчитайте план, попробуйте свой вариант и скачайте CSV.</p><button disabled={busy || !opened} onClick={onPlan}>Перейти к плану</button></li></ol>
  </details>
}

export default function TopicDetail({ dataset, topicId, schoolId, changingSchool, filterError, plan, onSchoolChange, onRetryFilter, onCompare, onPlan, onOverview }: {
  dataset: Dataset; topicId: string; schoolId: string; changingSchool: boolean; filterError: string | null; plan: PlanData | null
  onSchoolChange: (id: string) => void; onRetryFilter: () => void; onCompare: () => void; onPlan: () => void; onOverview: () => void
}) {
  const [data, setData] = useState<TopicsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let ignore = false
    setData(null); setError(null)
    curriculumApi.getTopics(dataset.dataset_id, schoolId || undefined)
      .then(result => { if (!ignore) setData(result) })
      .catch(reason => { if (!ignore) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить тему.') })
    return () => { ignore = true }
  }, [dataset.dataset_id, schoolId, attempt])
  const topic = data?.topics.find(topic => topic.topic_id === topicId)
  return <section aria-label="Разбор темы" aria-busy={!data && !error || changingSchool}>
    <button className="text-button" onClick={onOverview}>← К обзору</button>
    <div className="overview-toolbar"><div><span className="eyebrow">{topicId} · РАЗБОР ТЕМЫ</span><h2>{topic?.topic_name ?? 'Загружаем тему…'}</h2></div><div className="overview-controls"><DatasetBadge dataset={dataset} /><label className="school-filter">Школа<select aria-label="Школа" disabled={changingSchool} value={schoolId} onChange={event => onSchoolChange(event.target.value)}><option value="">Все школы</option>{dataset.school_ids.map(id => <option key={id}>{id}</option>)}</select></label></div></div>
    {filterError && <div role="alert" className="error-message"><p>{filterError}</p><button className="secondary-button" onClick={onRetryFilter}>Повторить смену школы</button></div>}
    {error && <div role="alert" className="error-message"><p>{error}</p><button className="secondary-button" onClick={() => setAttempt(n => n + 1)}>Повторить загрузку темы</button></div>}
    {!data && !error && <p className="loading-message" role="status">Загружаем показатели темы…</p>}
    {data && !topic && <p className="empty-state">Тема отсутствует в текущем наборе. Выберите другую тему на обзоре.</p>}
    {topic && data && <><AnalysisSummary topic={topic} threshold={data.mastery_threshold} plan={plan} />
      <div className="metrics-grid"><article className="metric"><h3>Ниже порога {data.mastery_threshold}</h3><strong>{topic.scores.below_threshold_pct === null ? 'Нет данных' : `${display(topic.scores.below_threshold_pct)}%`}</strong><p>Доля итоговых результатов</p></article><article className="metric"><h3>Средний итоговый балл</h3><strong>{display(topic.scores.post_score_avg)}</strong><p>Из 100</p></article><article className="metric"><h3>Размер выборки</h3><strong>{display(topic.scores.result_count)}</strong><p>Результатов по теме</p></article></div>
      <div className="next-actions"><article><span className="eyebrow">СЛЕДУЮЩИЙ ШАГ</span><h3>Что показывают учебники?</h3><p>Сравните прирост по этой теме с учётом школы и входного уровня.</p><button className="primary-button" disabled={changingSchool} onClick={onCompare}>Сравнить учебники по теме</button></article><article><span className="eyebrow">ПРОЕКТ РЕШЕНИЯ</span><h3>Как можно изменить часы?</h3><p>Проверьте автоматический план и попробуйте ручной перенос с сохранением бюджета.</p><button className="secondary-button" disabled={changingSchool} onClick={onPlan}>Открыть план по теме</button></article></div>
    </>}
  </section>
}

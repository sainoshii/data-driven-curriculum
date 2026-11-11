import { DatasetBadge } from './DatasetControls'
import { useEffect, useState } from 'react'
import { curriculumApi, type Dataset, type Scores, type TopicsData } from './data/curriculum'
import './heatmap-drilldown.css'

const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
const value = (n: number | null | undefined) => n == null ? 'Нет данных' : number.format(n)
const percent = (n: number | null | undefined) => n == null ? 'Нет данных' : `${value(n)}%`
const heatLevel = (n: number | null | undefined) => n == null ? 'missing' : n < 25 ? 'low' : n < 50 ? 'medium' : n < 75 ? 'high' : 'highest'

export function HeatmapCell({ school, topic, scores, busy, onInspect }: {
  school: string
  topic: TopicsData['topics'][number]
  scores: Scores | undefined
  busy: boolean
  onInspect: (schoolId: string, topicId: string) => void
}) {
  const belowThreshold = scores?.below_threshold_pct
  const description = `${school} · ${topic.topic_name} · Ниже порога: ${percent(belowThreshold)} · Средний балл: ${value(scores?.post_score_avg)} · Результатов: ${value(scores?.result_count)}`

  if (belowThreshold == null) return <td className="heat-missing" title={description}>Нет данных</td>

  return <td className={`heat-${heatLevel(belowThreshold)} heatmap-action-cell`} title={description}>
    <button
      type="button"
      className="heatmap-cell-button"
      aria-label={`Разобрать тему ${topic.topic_id} в школе ${school} · ${topic.topic_name} · ${percent(belowThreshold)} ниже порога`}
      aria-disabled={busy || undefined}
      onClick={() => { if (!busy) onInspect(school, topic.topic_id) }}
    >
      {percent(belowThreshold)}
    </button>
  </td>
}

export default function Topics({ dataset, schoolId, changingSchool, filterError, onSchoolChange, onRetryFilter, onCompareTopic, onInspectCell, onOverview }: {
  dataset: Dataset | null
  schoolId: string
  changingSchool: boolean
  filterError: string | null
  onSchoolChange: (id: string) => void
  onRetryFilter: () => void
  onCompareTopic: (topicId: string) => void
  onInspectCell: (schoolId: string, topicId: string) => void
  onOverview: () => void
}) {
  const [data, setData] = useState<TopicsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const datasetId = dataset?.dataset_id

  useEffect(() => {
    if (!datasetId) return
    let ignore = false
    setLoading(true)
    setData(null)
    setError(null)
    curriculumApi.getTopics(datasetId, schoolId || undefined)
      .then(result => { if (!ignore) setData(result) })
      .catch(reason => { if (!ignore) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить темы.') })
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [datasetId, schoolId, attempt])

  if (!dataset) return <section className="empty-state placeholder"><h2>Сначала откройте набор данных</h2><p>Откройте демо на «Обзоре», затем вернитесь к анализу тем.</p><button className="secondary-button" onClick={onOverview}>Перейти к обзору</button></section>

  // Exact percentages first; unknown values last. Never sort rounded labels.
  const topics = [...(data?.topics ?? [])].sort((a, b) =>
    (b.scores.below_threshold_pct ?? -1) - (a.scores.below_threshold_pct ?? -1) || a.topic_id.localeCompare(b.topic_id))
  const schools = schoolId ? [schoolId] : dataset.school_ids
  const cells = new Map(data?.heatmap.map(cell => [JSON.stringify([cell.school_id, cell.topic_id]), cell.scores]))

  return <section aria-label="Анализ тем" aria-busy={loading || changingSchool}>
    <div className="overview-toolbar">
      <div><h2>Сложность тем</h2><p>Доля результатов ниже порога, средний балл и размер выборки</p></div>
      <div className="overview-controls">
        <DatasetBadge dataset={dataset} />
        <label className="school-filter">Школа
          <select aria-label="Школа" value={schoolId} onChange={event => onSchoolChange(event.target.value)} disabled={loading || changingSchool}>
            <option value="">Все школы</option>
            {dataset.school_ids.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
      </div>
    </div>
    {filterError && <div className="error-message" role="alert"><p>{filterError}</p><button className="secondary-button" onClick={onRetryFilter} disabled={changingSchool}>Повторить смену школы</button></div>}
    {error && <div className="error-message" role="alert"><p>{error}</p><button className="secondary-button" onClick={() => setAttempt(n => n + 1)}>Повторить загрузку тем</button></div>}
    {(loading || changingSchool) && <p className="loading-message" role="status">Загружаем темы…</p>}
    {data && <>
      <section className="heatmap-section" aria-labelledby="heatmap-title">
        <div className="section-heading"><h2 id="heatmap-title">Школы × темы</h2><span>Сложные темы слева</span></div>
        <p className="sample-note">Доля результатов с итоговым баллом строго ниже {value(data.mastery_threshold)}. Темнее — выше доля. Нажмите на процент, чтобы разобрать тему в этой школе.</p>
        <div className="heat-legend" aria-label="Шкала тепловой карты">
          <span className="heat-low">0–&lt;25%</span><span className="heat-medium">25–&lt;50%</span><span className="heat-high">50–&lt;75%</span><span className="heat-highest">75–100%</span><span className="heat-missing">Нет данных</span>
        </div>
        <div className="table-scroll heatmap-scroll" role="region" aria-label="Тепловая карта, прокрутка по горизонтали" tabIndex={0}>
          <table className="heatmap-table">
            <caption>{schools.length} × {topics.length} (школы × темы) · {schools.length * topics.length} ячеек</caption>
            <thead><tr><th scope="col">Школа</th>{topics.map(topic => <th scope="col" key={topic.topic_id} title={topic.topic_name}>{topic.topic_id}<span className="sr-only"> — {topic.topic_name}</span></th>)}</tr></thead>
            <tbody>{schools.map(school => <tr key={school}><th scope="row">{school}</th>{topics.map(topic =>
              <HeatmapCell
                key={topic.topic_id}
                school={school}
                topic={topic}
                scores={cells.get(JSON.stringify([school, topic.topic_id]))}
                busy={loading || changingSchool}
                onInspect={onInspectCell}
              />
            )}</tr>)}</tbody>
          </table>
        </div>
        <p className="sample-note">Коды тем соответствуют таблице ниже. Наведите на код, чтобы увидеть название, на ячейку — показатели.</p>
      </section>
      <section aria-labelledby="topics-table-title" className="topics-table-section">
        <div className="section-heading"><h2 id="topics-table-title">Все темы · {topics.length}</h2><span>По доле ниже порога ↓</span></div>
        <div className="table-scroll" role="region" aria-label="Таблица тем" tabIndex={0}>
          <table className="topics-table">
            <caption>Темы по убыванию сложности · {schoolId || 'Все школы'}</caption>
            <thead><tr><th scope="col">Тема</th><th scope="col" aria-sort="descending">Результаты ниже {value(data.mastery_threshold)} баллов</th><th scope="col">Средний итоговый балл</th><th scope="col">Размер выборки</th></tr></thead>
            <tbody>
              {topics.map(topic => <tr key={topic.topic_id}>
                <th scope="row">
                  <span className="topic-code">{topic.topic_id}</span>{topic.topic_name}
                  <button
                    type="button"
                    className="secondary-button topic-compare-button"
                    aria-label={`Сравнить учебники по теме «${topic.topic_name}»`}
                    disabled={loading || changingSchool}
                    onClick={() => onCompareTopic(topic.topic_id)}
                  >
                    Сравнить учебники
                  </button>
                </th>
                <td>{percent(topic.scores.below_threshold_pct)}</td>
                <td>{value(topic.scores.post_score_avg)}</td>
                <td>{value(topic.scores.result_count)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        {!topics.length && <p className="empty-state">В наборе нет тем.</p>}
        <p className="sample-note">Размер выборки — число результатов (пар ученик–тема). Средний балл — из 100. «Нет данных» отличается от нулевого результата.</p>
      </section>
    </>}
  </section>
}

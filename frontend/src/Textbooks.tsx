import { DatasetBadge } from './DatasetControls'
import { useEffect, useState } from 'react'
import { curriculumApi, type Dataset, type TopicScores, type TextbookComparisonData } from './data/curriculum'

const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
const signed = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, signDisplay: 'exceptZero' })
const value = (n: number | null) => n === null ? 'Нет данных' : number.format(n)

export function ComparisonTables({ data }: { data: TextbookComparisonData }) {
  return <>
    <section className="textbook-section" aria-labelledby="groups-title">
      <h2 id="groups-title">Сводка по учебникам</h2>
      <p className="sample-note">Средние по выбранной теме и школе. Прирост — итоговый балл минус входной, в баллах.</p>
      {data.groups.length ? <div className="table-scroll" role="region" aria-label="Сводка учебников" tabIndex={0}>
        <table className="textbook-table"><caption>{data.topic_id} · {data.school_id ?? 'Все школы'}</caption>
          <thead><tr><th scope="col">Учебник</th><th scope="col">Ученики</th><th scope="col">Средний входной балл</th><th scope="col">Средний итоговый балл</th><th scope="col">Средний прирост, баллы</th></tr></thead>
          <tbody>{data.groups.map(group => <tr key={group.textbook_id}><th scope="row">{group.textbook_id}</th><td>{value(group.student_count)}</td><td>{value(group.pre_score_avg)}</td><td>{value(group.post_score_avg)}</td><td>{signed.format(group.gain_avg)}</td></tr>)}</tbody>
        </table>
      </div> : <p className="empty-state">Нет результатов по учебникам для этого среза.</p>}
    </section>
    <section className="textbook-section" aria-labelledby="pairs-title">
      <h2 id="pairs-title">Попарное наблюдаемое сравнение</h2>
      <p className="sample-note">Разница прироста: левый учебник минус правый. Плюс — больший прирост слева, минус — справа. Размеры выборок относятся только к сопоставимым группам.</p>
      {data.comparisons.length ? <div className="table-scroll" role="region" aria-label="Попарное сравнение учебников" tabIndex={0}>
        <table className="comparison-table"><caption>Сопоставление по школе и входному уровню</caption>
          <thead><tr><th scope="col">Левый / правый</th><th scope="col">Разница прироста, баллы</th><th scope="col">Ученики слева</th><th scope="col">Ученики справа</th></tr></thead>
          <tbody>{data.comparisons.map(pair => <tr key={JSON.stringify([pair.left_textbook_id, pair.right_textbook_id])}><th scope="row">{pair.left_textbook_id} / {pair.right_textbook_id}</th><td>{pair.status === 'insufficient_data' ? <span className="insufficient-data">Недостаточно сопоставимых данных</span> : pair.gain_difference === null ? 'Нет данных' : signed.format(pair.gain_difference)}</td><td>{value(pair.left_student_count)}</td><td>{value(pair.right_student_count)}</td></tr>)}</tbody>
        </table>
      </div> : <p className="empty-state">Нет пар учебников для сравнения.</p>}
      <div className="context-note"><span className="info-mark">i</span><p>Это наблюдаемые различия между группами, а не доказательство влияния учебника. Сравнение учитывает школу и диапазон входного балла; в каждом учебнике должно быть не менее 20 учеников в сопоставляемой группе.</p></div>
    </section>
  </>
}

function Comparison({ datasetId, topicId, schoolId }: { datasetId: string; topicId: string; schoolId: string }) {
  const [data, setData] = useState<TextbookComparisonData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let ignore = false
    setError(null)
    setData(null)
    curriculumApi.getTextbookComparison(datasetId, topicId, schoolId || undefined)
      .then(result => { if (!ignore) setData(result) })
      .catch(reason => { if (!ignore) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить сравнение.') })
    return () => { ignore = true }
  }, [datasetId, topicId, schoolId, attempt])

  if (error) return <div className="error-message" role="alert"><p>{error}</p><button className="secondary-button" onClick={() => setAttempt(n => n + 1)}>Повторить сравнение</button></div>
  if (!data) return <p className="loading-message" role="status">Загружаем сравнение учебников…</p>
  return <ComparisonTables data={data} />
}

export default function Textbooks({ dataset, schoolId, topicId, changingSchool, filterError, onTopicChange, onSchoolChange, onRetryFilter, onOverview }: {
  dataset: Dataset | null
  schoolId: string
  topicId: string
  changingSchool: boolean
  filterError: string | null
  onTopicChange: (id: string) => void
  onSchoolChange: (id: string) => void
  onRetryFilter: () => void
  onOverview: () => void
}) {
  const [topics, setTopics] = useState<TopicScores[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const datasetId = dataset?.dataset_id
  useEffect(() => {
    if (!datasetId) return
    let ignore = false
    setError(null)
    setTopics(null)
    // The plan's complete topic list is independent of the school filter.
    curriculumApi.getTopics(datasetId)
      .then(result => { if (!ignore) setTopics([...result.topics].sort((a, b) => a.topic_id.localeCompare(b.topic_id))) })
      .catch(reason => { if (!ignore) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить список тем.') })
    return () => { ignore = true }
  }, [datasetId, attempt])

  useEffect(() => {
    if (topics?.length && !topics.some(topic => topic.topic_id === topicId)) onTopicChange(topics[0].topic_id)
  }, [topics, topicId, onTopicChange])

  if (!dataset) return <section className="empty-state placeholder"><h2>Сначала откройте набор данных</h2><p>Откройте демо на «Обзоре», затем вернитесь к сравнению учебников.</p><button className="secondary-button" onClick={onOverview}>Перейти к обзору</button></section>

  return <section aria-label="Анализ учебников">
    <div className="overview-toolbar"><div><h2>Сравнение учебников</h2><p>Результаты по одной теме в выбранном срезе</p></div><DatasetBadge dataset={dataset} /></div>
    <div className="textbook-filters">
      <label className="school-filter topic-filter">Тема<select aria-label="Тема" value={topicId} disabled={!topics?.length || changingSchool} onChange={event => onTopicChange(event.target.value)}>{!topics?.length && <option value="">{topics ? 'Нет тем' : 'Загрузка тем…'}</option>}{topics?.map(topic => <option key={topic.topic_id} value={topic.topic_id}>{topic.topic_id} · {topic.topic_name}</option>)}</select></label>
      <label className="school-filter">Школа<select aria-label="Школа" value={schoolId} disabled={changingSchool} onChange={event => onSchoolChange(event.target.value)}><option value="">Все школы</option>{dataset.school_ids.map(id => <option key={id} value={id}>{id}</option>)}</select></label>
    </div>
    {filterError && <div className="error-message" role="alert"><p>{filterError}</p><button className="secondary-button" disabled={changingSchool} onClick={onRetryFilter}>Повторить смену школы</button></div>}
    {error && <div className="error-message" role="alert"><p>{error}</p><button className="secondary-button" onClick={() => setAttempt(n => n + 1)}>Повторить загрузку тем</button></div>}
    {!topics && !error && <p className="loading-message" role="status">Загружаем список тем…</p>}
    {topics?.length === 0 && <p className="empty-state">В наборе нет тем для сравнения.</p>}
    {changingSchool ? <p className="loading-message" role="status">Обновляем школу…</p> : topics?.some(topic => topic.topic_id === topicId) && <Comparison key={JSON.stringify([dataset.dataset_id, schoolId, topicId])} datasetId={dataset.dataset_id} schoolId={schoolId} topicId={topicId} />}
  </section>
}

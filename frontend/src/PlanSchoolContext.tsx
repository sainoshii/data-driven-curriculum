import { useEffect, useState } from 'react'
import { curriculumApi, type PlanData, type TopicsData } from './data/curriculum'

const minResults = 20
const difficultyPct = 50
const percent = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })

export function summarizeSchools(cells: TopicsData['heatmap'], topicId: string) {
  const schools = cells.filter(cell => cell.topic_id === topicId).map(cell => ({
    id: cell.school_id,
    count: cell.scores.result_count,
    below: cell.scores.result_count >= minResults ? cell.scores.below_threshold_pct : null,
  }))
  const comparable = schools.map(school => school.below).filter(pct => pct !== null)
  return {
    schools,
    comparable: comparable.length,
    difficult: comparable.filter(pct => pct >= difficultyPct).length,
  }
}

export default function PlanSchoolContext({ plan }: { plan: PlanData }) {
  const [data, setData] = useState<TopicsData | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const { dataset_id: datasetId, mastery_threshold: threshold } = plan

  useEffect(() => {
    let active = true
    curriculumApi.getTopics(datasetId).then(
      result => { if (active) setData(result) },
      () => { if (active) setFailed(true) },
    )
    return () => { active = false }
  }, [datasetId, attempt])

  return <section className="plan-section school-context" aria-labelledby="school-context-title">
    <h2 id="school-context-title">Темы с дополнительными часами по школам</h2>
    <p>Считаем тему сложной для школы, если от {difficultyPct}% результатов ниже {threshold} баллов. Учитываем школы, где есть хотя бы {minResults} результатов по теме.</p>
    {failed && <div className="error-message" role="alert"><p>Не удалось загрузить разбивку по школам.</p><button className="secondary-button" onClick={() => { setFailed(false); setAttempt(attempt + 1) }}>Повторить</button></div>}
    {!data && !failed && <p className="loading-message" role="status">Загружаем разбивку…</p>}
    {data && <div className="school-context-list">{plan.items.filter(item => item.delta_hours > 0).map(item => {
      const { schools, comparable, difficult } = summarizeSchools(data.heatmap, item.topic_id)
      return <details key={item.topic_id}>
        <summary><span><span className="topic-code">{item.topic_id}</span>{item.topic_name}</span><strong>{comparable ? `Сложная в ${difficult} из ${comparable} школ` : 'Недостаточно данных'}</strong></summary>
        <ul>{schools.map(school => <li key={school.id}><span>{school.id}</span><span>{school.below === null ? `Недостаточно данных (n = ${school.count})` : `${percent.format(school.below)}% ниже ${threshold}`}</span></li>)}</ul>
      </details>
    })}</div>}
  </section>
}

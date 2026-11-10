import type { Dataset, OverviewData } from './data/curriculum'
import { DatasetBadge } from './DatasetControls'

export interface DemoState {
  dataset: Dataset | null
  overview: OverviewData | null
  loading: boolean
  error: string | null
}

const decimal = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
const integer = new Intl.NumberFormat('ru-RU')
const score = (value: number | null) => value === null ? 'Нет данных' : decimal.format(value)
const percent = (value: number | null) => value === null ? 'Нет данных' : `${decimal.format(value)}%`

export default function Overview({ state, onSchoolChange, onRetry }: {
  state: DemoState
  onSchoolChange: (schoolId: string) => void
  onRetry: () => void
}) {
  const { dataset, overview, loading, error } = state
  // Sort before rounding; missing observations must not be treated as zero.
  const topics = overview?.hardest_topics
    .filter(topic => topic.scores.result_count > 0 && topic.scores.below_threshold_pct !== null)
    .sort((a, b) => b.scores.below_threshold_pct! - a.scores.below_threshold_pct! || a.topic_id.localeCompare(b.topic_id))
    .slice(0, 3) ?? []

  return <>
    {!overview && <section className="welcome" aria-labelledby="welcome-title">
      <div className="welcome-copy">
        <span className="eyebrow">ОТ ДАННЫХ К УЧЕБНОМУ ПЛАНУ</span>
        <h2 id="welcome-title">Больше ясности.<br />Обоснованнее решения.</h2>
        <p>Находите сложные темы, сравнивайте результаты групп с разными учебниками и готовьте проект перераспределения учебных часов.</p>
      </div>
      <div className="welcome-art" aria-hidden="true"><div className="art-grid" /><div className="art-bars"><i /><i /><i /><i /><i /></div><div className="art-label"><span /> Анализ → решение</div></div>
    </section>}

    {error && <div className="error-message" role="alert"><p>{error}</p><button className="secondary-button" disabled={loading} onClick={onRetry}>Повторить</button></div>}
    <div role="status" className="loading-message">{loading ? 'Загружаем показатели…' : ''}</div>

    {dataset && overview ? <section className="overview-results" aria-label="Показатели обзора" aria-busy={loading}>
      <div className="overview-toolbar">
        <div><h2>Результаты обучения</h2><p>Показатели выбранной группы школ</p></div>
        <div className="overview-controls">
          <DatasetBadge dataset={dataset} />
          <label className="school-filter">Школа
            <select value={overview.school_id ?? ''} onChange={event => onSchoolChange(event.target.value)} disabled={loading}>
              <option value="">Все школы</option>
              {dataset.school_ids.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
        </div>
      </div>
      <div className="metrics-grid">
        <article className="metric"><h3>Количество учеников</h3><strong>{integer.format(overview.student_count)}</strong><p>Уникальные ученики в выбранном срезе</p></article>
        <article className="metric"><h3>Средний итоговый балл</h3><strong>{score(overview.scores.post_score_avg)}</strong><p>Из 100 · по парам ученик–тема</p></article>
        <article className="metric"><h3>Результаты ниже порога</h3><strong>{percent(overview.scores.below_threshold_pct)}</strong><p>Итоговый балл строго ниже {score(overview.mastery_threshold)}</p></article>
      </div>
      <p className="sample-note">В срезе: {integer.format(overview.scores.result_count)} результатов (пар ученик–тема).</p>

      <section className="hardest-topics" aria-labelledby="hardest-title">
        <div className="section-heading"><h2 id="hardest-title">Три самые сложные темы</h2><span>По доле результатов ниже порога</span></div>
        {topics.length ? <ol className="topic-list">{topics.map((topic, index) => <li key={topic.topic_id}>
          <span className="topic-rank" aria-hidden="true">0{index + 1}</span>
          <div className="topic-description"><h3>{topic.topic_name}</h3><p>{topic.topic_id} · Средний балл: {score(topic.scores.post_score_avg)} · Результатов: {integer.format(topic.scores.result_count)}</p></div>
          <div className="topic-percent"><strong>{percent(topic.scores.below_threshold_pct)}</strong><span>ниже {score(overview.mastery_threshold)} баллов</span></div>
        </li>)}</ol> : <p className="empty-state">Нет результатов для определения сложных тем.</p>}
      </section>
      {dataset.is_demo && <div className="context-note"><span className="info-mark">i</span><p>Синтетические данные для демонстрации. Они не описывают реальные результаты школьников.</p></div>}
    </section> : <section className="empty-state" aria-labelledby="empty-title">
      <h2 id="empty-title">Данные ещё не загружены</h2>
      <p>{import.meta.env.VITE_PUBLIC_DEMO === 'true'
        ? 'Откройте демо, чтобы увидеть показатели и темы, требующие внимания.'
        : 'Загрузите CSV или откройте демо, чтобы увидеть показатели и темы, требующие внимания.'}</p>
      <span className="empty-note">Нет данных для анализа</span>
    </section>}
  </>
}

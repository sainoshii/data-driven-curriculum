import { useState, type FormEvent } from 'react'
import { ApiError, type Dataset } from './data/curriculum'

export function DatasetBadge({ dataset }: { dataset: Dataset }) {
  return <span className={dataset.is_demo ? 'demo-badge' : 'demo-badge uploaded-badge'}>{dataset.is_demo ? 'Демонстрационные данные' : 'Загруженные данные'}</span>
}

export function DatasetErrorMessage({ error }: { error: Error }) {
  return <div className="error-message" role="alert"><p>{error.message}</p>
    {error instanceof ApiError && error.details.length > 0 && <ul>{error.details.map((detail, index) => <li key={index}>
      {typeof detail.file === 'string' && <span>Файл: {detail.file === 'results' || detail.file === 'topics' ? `${detail.file}.csv` : detail.file}. </span>}
      {typeof detail.row === 'number' && <span>Строка: {detail.row}. </span>}
      {typeof detail.field === 'string' && <span>Столбец: {detail.field}. </span>}
      {detail.message}
    </li>)}</ul>}
    <p className="upload-error-note">Открытый набор не изменён. Исправьте файлы и повторите загрузку.</p>
  </div>
}

export default function DatasetControls({ busy, action, error, onDemo, onUpload }: {
  busy: boolean
  action: 'demo' | 'upload' | null
  error: Error | null
  onDemo: () => void
  onUpload: (results: File, topics: File) => void
}) {
  const [results, setResults] = useState<File | null>(null)
  const [topics, setTopics] = useState<File | null>(null)
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (results && topics) onUpload(results, topics)
  }
  return <section className="dataset-controls" aria-labelledby="dataset-controls-title" aria-busy={busy}>
    <h2 id="dataset-controls-title">Данные для анализа</h2>
    <div className="dataset-options">
      <div className="demo-option"><button className="primary-button" onClick={onDemo} disabled={busy}>{busy && action === 'demo' ? 'Открываем демо…' : 'Открыть демо'}</button><p>Математика, 7-й класс.<br />Синтетические результаты.</p></div>
      <form onSubmit={submit} className="upload-form">
        <fieldset disabled={busy}><legend>Загрузить свои CSV</legend>
          <div className="upload-fields"><label>results.csv — результаты<input name="results" type="file" accept=".csv,text/csv" required onChange={event => setResults(event.target.files?.[0] ?? null)} /></label>
          <label>topics.csv — темы и часы<input name="topics" type="file" accept=".csv,text/csv" required onChange={event => setTopics(event.target.files?.[0] ?? null)} /></label></div>
          <div className="upload-submit"><button className="secondary-button" type="submit" disabled={!results || !topics}>{busy && action === 'upload' ? 'Загружаем CSV…' : 'Загрузить CSV'}</button><p>Два файла в UTF-8, разделитель — запятая. До 5 МиБ каждый.</p></div>
        </fieldset>
      </form>
    </div>
    {error && <DatasetErrorMessage error={error} />}
  </section>
}

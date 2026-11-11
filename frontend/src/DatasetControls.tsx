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

export type UploadFileNames = { results: string; topics: string }
const publicDemo = import.meta.env.VITE_PUBLIC_DEMO === 'true'

export default function DatasetControls({ hidden, opened = false, activeUpload, busy, action, error, onDemo, onUpload }: {
  hidden: boolean
  opened?: boolean
  activeUpload: UploadFileNames | null
  busy: boolean
  action: 'demo' | 'upload' | null
  error: Error | null
  onDemo: () => void
  onUpload: (results: File, topics: File) => Promise<boolean>
}) {
  const [results, setResults] = useState<File | null>(null)
  const [topics, setTopics] = useState<File | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    if (results && topics && await onUpload(results, topics)) {
      form.reset()
      setResults(null)
      setTopics(null)
    }
  }
  return <section className={`dataset-controls ${opened ? 'dataset-opened' : 'dataset-launch'}`} hidden={hidden} aria-labelledby="dataset-controls-title" aria-busy={busy}>
    {!opened && <span className="eyebrow">ОТ ДАННЫХ К УЧЕБНОМУ ПЛАНУ</span>}
    <h2 id="dataset-controls-title">{opened ? 'Данные для анализа' : 'Поймите, каким темам нужны часы'}</h2>
    {!opened && <p className="dataset-intro">Найдите сложные темы, сравните учебники и подготовьте обоснованный план — с сохранением бюджета часов.</p>}
    {!opened && <ol className="launch-flow" aria-label="Путь от данных к решению"><li><span>01</span><strong>Найдите сложные темы</strong><small>По результатам учеников</small></li><li><span>02</span><strong>Проверьте учебники</strong><small>В сопоставимых группах</small></li><li><span>03</span><strong>Подготовьте план часов</strong><small>С основаниями и отчётом</small></li></ol>}
    {activeUpload && <div className="active-upload" role="status">
      <strong>Используются загруженные CSV</strong>
      <p>Результаты: <b>{activeUpload.results}</b> · Темы и часы: <b>{activeUpload.topics}</b></p>
    </div>}
    <div className="dataset-options">
      <div className="demo-option"><button className={opened ? 'secondary-button' : 'primary-button'} onClick={onDemo} disabled={busy}>{busy && action === 'demo' ? 'Открываем демо…' : 'Открыть демо'}<span aria-hidden="true">→</span></button><p>Математика, 7-й класс.<br />Синтетические результаты.</p></div>
      {!publicDemo && <details className="upload-disclosure"><summary>{opened ? 'Загрузить или заменить CSV' : 'Загрузить свои данные'}</summary><form onSubmit={submit} className="upload-form">
        <fieldset disabled={busy}><legend>{activeUpload ? 'Заменить набор CSV' : 'Загрузить свои CSV'}</legend>
          <div className="upload-fields"><label>results.csv — результаты<input name="results" type="file" accept=".csv,text/csv" required onChange={event => setResults(event.target.files?.[0] ?? null)} /></label>
          <label>topics.csv — темы и часы<input name="topics" type="file" accept=".csv,text/csv" required onChange={event => setTopics(event.target.files?.[0] ?? null)} /></label></div>
          <div className="upload-submit"><button className="secondary-button" type="submit" disabled={!results || !topics}>{busy && action === 'upload' ? 'Загружаем CSV…' : 'Загрузить CSV'}</button><p>Два файла в UTF-8, разделитель — запятая. До 5 МиБ каждый.</p></div>
        </fieldset>
      </form></details>}
    </div>
    {error && <DatasetErrorMessage error={error} />}
  </section>
}

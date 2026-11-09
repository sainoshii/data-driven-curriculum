import { useEffect, useState } from 'react'
import Overview, { type DemoState } from './Overview'
import { curriculumApi } from './data/curriculum'

const sections = [
  { id: 'overview', label: 'Обзор', icon: 'overview' },
  { id: 'topics', label: 'Темы', icon: 'topics' },
  { id: 'textbooks', label: 'Учебники', icon: 'books' },
  { id: 'hours', label: 'План часов', icon: 'hours' },
] as const

type Section = typeof sections[number]['id']
type IconName = typeof sections[number]['icon'] | 'arrow' | 'data'

function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    topics: <><path d="M8 5h13M8 12h13M8 19h13" /><path d="M3 5h.01M3 12h.01M3 19h.01" strokeWidth="3" /></>,
    books: <><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Z" /><path d="M12 5v15" /></>,
    hours: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18m-14 5h3m4 0h3" /></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    data: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 4 16 4 16 0V5M4 12v7c0 4 16 4 16 0v-7" /></>,
  }
  return <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

const placeholderCopy: Record<Exclude<Section, 'overview'>, string> = {
  topics: 'Здесь появится анализ сложности тем: доля учеников с итоговым баллом ниже порога, средний результат и размер выборки.',
  textbooks: 'Здесь появится сравнение прироста баллов у сопоставимых групп с разными учебниками и размеры выборок.',
  hours: 'Здесь появится проект перераспределения часов с основаниями переносов и сохранением общего бюджета.',
}

export default function App() {
  const [active, setActive] = useState<Section>('overview')
  const [demo, setDemo] = useState<DemoState>({ dataset: null, overview: null, loading: false, error: null })

  async function openDemo() {
    setDemo(previous => ({ ...previous, loading: true, error: null }))
    try {
      const dataset = await curriculumApi.openDemoDataset()
      const overview = await curriculumApi.getOverview(dataset.dataset_id)
      setDemo({ dataset, overview, loading: false, error: null })
    } catch {
      setDemo(previous => ({ ...previous, loading: false, error: 'Не удалось открыть демо. Попробуйте ещё раз.' }))
    }
  }

  async function changeSchool(schoolId: string) {
    if (!demo.dataset) return
    setDemo(previous => ({ ...previous, loading: true, error: null }))
    try {
      const overview = await curriculumApi.getOverview(demo.dataset.dataset_id, schoolId || undefined)
      setDemo(previous => ({ ...previous, overview, loading: false, error: null }))
    } catch {
      setDemo(previous => ({ ...previous, loading: false, error: 'Не удалось обновить показатели. Выберите школу ещё раз.' }))
    }
  }

  const current = sections.find(section => section.id === active)!
  useEffect(() => { document.title = `${current.label} · Data-Driven Curriculum` }, [current.label])

  return <div className="app-shell">
    <a className="skip-link" href="#main">К содержимому</a>
    <aside className="sidebar">
      <div className="brand"><span className="brand-symbol" aria-hidden="true"><i /><i /><i /></span><div>Data-Driven<span>Curriculum</span></div></div>
      <div className="workspace-label">ПАНЕЛЬ МЕТОДИСТА</div>
      <nav aria-label="Основная навигация">{sections.map(section => <button key={section.id} type="button" className={`nav-item ${active === section.id ? 'active' : ''}`} aria-current={active === section.id ? 'page' : undefined} onClick={() => setActive(section.id)}><Icon name={section.icon} />{section.label}{active === section.id && <span className="active-dot" />}</button>)}</nav>
      <div className="sidebar-bottom"><span className="version-tag">MVP</span><p>Решения для учебного плана,<br />основанные на данных.</p></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><span>Рабочее пространство</span><div className="dataset-status"><span />{demo.dataset ? 'Данные загружены' : 'Данные не загружены'}</div></header>
      <main id="main" tabIndex={-1}>
        <div className="page-heading"><div><div className="breadcrumb">Панель методиста <span>/</span> {current.label}</div><h1>{current.label}</h1></div><span className="subject-tag">Математика · 7 класс</span></div>
        {active === 'overview' ? <Overview state={demo} onOpenDemo={openDemo} onSchoolChange={changeSchool} /> : <section className="empty-state placeholder" aria-labelledby="placeholder-title"><div className="empty-icon"><Icon name={current.icon} /></div><span className="eyebrow">СЛЕДУЮЩИЙ ЭТАП</span><h2 id="placeholder-title">{current.label}: раздел в разработке</h2><p>{placeholderCopy[active]}</p><button className="secondary-button" onClick={() => setActive('overview')}>Вернуться к обзору <Icon name="arrow" /></button></section>}
        <footer>Data-Driven Curriculum <span>Инструмент поддержки решений методиста</span></footer>
      </main>
    </div>
  </div>
}

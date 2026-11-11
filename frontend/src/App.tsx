import { useEffect, useRef, useState } from 'react'
import Overview, { type DemoState } from './Overview'
import Topics from './Topics'
import Plan, { planMatchesScope } from './Plan'
import TopicDetail, { DemoGuide, UploadReceipt, type UploadReceiptData } from './GuidedAnalysis'
import type { ScenarioState } from './PlanScenario'
import Textbooks from './Textbooks'
import DatasetControls, { type UploadFileNames } from './DatasetControls'
import { curriculumApi, type Dataset, type OverviewData, type PlanData } from './data/curriculum'

const sections = [
  { id: 'overview', label: 'Обзор', icon: 'overview' },
  { id: 'topics', label: 'Темы', icon: 'topics' },
  { id: 'textbooks', label: 'Учебники', icon: 'books' },
  { id: 'hours', label: 'План часов', icon: 'hours' },
] as const

type Section = typeof sections[number]['id'] | 'topic-detail'
type IconName = typeof sections[number]['icon'] | 'arrow' | 'data'

type WorkspaceEntry = {
  section: Section
  topicId: string
  overview: OverviewData | null
  canGoBack: boolean
}

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

export default function App() {
  const [active, setActive] = useState<Section>('overview')
  const [demo, setDemo] = useState<DemoState>({ dataset: null, overview: null, loading: false, error: null })
  const [schoolRequest, setSchoolRequest] = useState<{ schoolId: string; topicId?: string }>({ schoolId: '' })
  const [selectedTopic, setSelectedTopic] = useState('')
  const [plan, setPlan] = useState<PlanData | null>(null)
  const [scenario, setScenario] = useState<ScenarioState | null>(null)
  const [planInvalidated, setPlanInvalidated] = useState(false)
  const [datasetError, setDatasetError] = useState<Error | null>(null)
  const [datasetAction, setDatasetAction] = useState<'demo' | 'upload' | null>(null)
  const [activeUpload, setActiveUpload] = useState<UploadFileNames | null>(null)
  const [receipt, setReceipt] = useState<UploadReceiptData | null>(null)
  const [compared, setCompared] = useState(false)
  const [canGoBack, setCanGoBack] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const navigationRevision = useRef(0)
  const schoolRequestRevision = useRef(0)
  const historyId = useRef<string | null>(null)
  const workspaceHistory = useRef(new Map<string, WorkspaceEntry>())

  useEffect(() => {
    if (!historyId.current) {
      historyId.current = crypto.randomUUID()
      window.history.replaceState({ workspaceId: historyId.current }, '')
    }
    workspaceHistory.current.set(historyId.current, { section: active, topicId: selectedTopic, overview: demo.overview, canGoBack })

    function restoreView(event: PopStateEvent) {
      const id = event.state?.workspaceId
      const entry = typeof id === 'string' ? workspaceHistory.current.get(id) : undefined
      historyId.current = entry ? id : null
      navigationRevision.current += 1
      schoolRequestRevision.current += 1
      setCanGoBack(entry?.canGoBack ?? false)
      setActive(entry?.section ?? 'overview')
      setSelectedTopic(entry?.topicId ?? '')
      setDemo(previous => ({
        ...previous,
        overview: entry?.overview ?? previous.overview,
        loading: datasetAction !== null && previous.loading,
        error: null,
      }))
      mainRef.current?.focus({ preventScroll: true })
    }

    window.addEventListener('popstate', restoreView)
    return () => window.removeEventListener('popstate', restoreView)
  }, [active, selectedTopic, demo.overview, datasetAction, canGoBack])

  function compareTopic(topicId: string) {
    setCompared(true)
    navigate('textbooks', topicId)
  }

  function navigate(section: Section, topicId = selectedTopic) {
    if (section === active && topicId === selectedTopic) return
    navigationRevision.current += 1
    historyId.current = crypto.randomUUID()
    window.history.pushState({ workspaceId: historyId.current }, '')
    setCanGoBack(true)
    setActive(section)
    setSelectedTopic(topicId)
    mainRef.current?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
  }

  function inspectTopic(topicId: string) {
    navigate('topic-detail', topicId)
  }

  async function replaceDataset(action: 'demo' | 'upload', load: () => Promise<Dataset>, files: UploadFileNames | null = null) {
    setDatasetAction(action)
    setDatasetError(null)
    setDemo(previous => ({ ...previous, loading: true, error: null }))
    try {
      const dataset = await load()
      const [overview, topics] = await Promise.all([
        curriculumApi.getOverview(dataset.dataset_id),
        action === 'upload' ? curriculumApi.getTopics(dataset.dataset_id) : Promise.resolve(null),
      ])
      workspaceHistory.current.clear()
      historyId.current = null
      setCanGoBack(false)
      setDemo({ dataset, overview, loading: false, error: null })
      setActive('overview')
      setActiveUpload(files)
      setSchoolRequest({ schoolId: '' })
      setSelectedTopic('')
      setPlan(null)
      setScenario(null)
      setPlanInvalidated(false)
      setCompared(false)
      setReceipt(files && topics ? { datasetId: dataset.dataset_id, studentCount: overview.student_count, schoolCount: dataset.school_ids.length, topicCount: topics.topics.length, resultCount: overview.scores.result_count, resultsFile: files.results, topicsFile: files.topics } : null)
      return true
    } catch (error) {
      setDatasetError(error instanceof Error ? error : new Error('Не удалось открыть набор. Повторите попытку.'))
      setDemo(previous => ({ ...previous, loading: false }))
      return false
    } finally { setDatasetAction(null) }
  }

  const openDemo = () => replaceDataset('demo', () => curriculumApi.openDemoDataset())
  const uploadDataset = (results: File, topics: File) => replaceDataset('upload', () => curriculumApi.uploadDataset(results, topics), { results: results.name, topics: topics.name })

  async function changeSchool(schoolId: string, topicId?: string) {
    if (!demo.dataset || demo.loading) return
    if (topicId && schoolId === demo.overview?.school_id) {
      setDemo(previous => ({ ...previous, error: null }))
      inspectTopic(topicId)
      return
    }

    const startingNavigation = navigationRevision.current
    const requestRevision = ++schoolRequestRevision.current
    setSchoolRequest({ schoolId, topicId })
    setDemo(previous => ({ ...previous, loading: true, error: null }))
    try {
      const overview = await curriculumApi.getOverview(demo.dataset.dataset_id, schoolId || undefined)
      if (requestRevision !== schoolRequestRevision.current) return
      setDemo(previous => ({ ...previous, overview, loading: false, error: null }))
      setPlan(null)
      setScenario(null)
      setPlanInvalidated(true)
      setCompared(false)
      if (topicId && startingNavigation === navigationRevision.current) inspectTopic(topicId)
    } catch (error) {
      if (requestRevision !== schoolRequestRevision.current) return
      setDemo(previous => ({ ...previous, loading: false, error: error instanceof Error ? error.message : 'Не удалось обновить показатели. Попробуйте ещё раз.' }))
    }
  }

  function retrySchool() {
    changeSchool(schoolRequest.schoolId, active === 'topics' ? schoolRequest.topicId : undefined)
  }

  const current = sections.find(section => section.id === active) ?? { label: 'Разбор темы', icon: 'topics' }
  const currentAutoPlan = plan && demo.dataset && planMatchesScope(plan, demo.dataset.dataset_id, demo.overview?.school_id ?? '') ? plan : null
  const firstTopic = demo.overview?.hardest_topics[0]?.topic_id
  useEffect(() => { document.title = `${current.label} · Data-Driven Curriculum` }, [current.label])

  return <div className="app-shell">
    <a className="skip-link" href="#main">К содержимому</a>
    <aside className="sidebar">
      <div className="brand"><span className="brand-symbol" aria-hidden="true"><i /><i /><i /></span><div>Data-Driven<span>Curriculum</span></div></div>
      <div className="workspace-label">ПАНЕЛЬ МЕТОДИСТА</div>
      <nav aria-label="Основная навигация">{sections.map(section => <button key={section.id} type="button" className={`nav-item ${active === section.id || active === 'topic-detail' && section.id === 'topics' ? 'active' : ''}`} aria-current={active === section.id ? 'page' : undefined} onClick={() => navigate(section.id)}><Icon name={section.icon} />{section.label}{active === section.id && <span className="active-dot" />}</button>)}</nav>
      <div className="sidebar-bottom"><span className="version-tag">MVP</span><p>Решения для учебного плана,<br />основанные на данных.</p></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><span>Рабочее пространство</span><div className="dataset-status"><span />{demo.dataset ? 'Данные загружены' : 'Данные не загружены'}</div></header>
      <main ref={mainRef} id="main" tabIndex={-1}>
        {canGoBack && <button type="button" className="text-button workspace-back" onClick={() => window.history.back()}>← Назад</button>}
        <div className="page-heading"><div><div className="breadcrumb">Панель методиста <span>/</span> {current.label}</div><h1>{current.label}</h1></div><span className="subject-tag">Математика · 7 класс</span></div>
        <div className={`overview-layout ${demo.overview ? 'has-results' : ''}`}>
        {active === 'overview' && receipt?.datasetId === demo.dataset?.dataset_id && receipt && <UploadReceipt receipt={receipt} onStart={() => { setReceipt(null); requestAnimationFrame(() => { const target = document.getElementById('analysis-start'); target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'start' }) }) }} />}
        {active === 'overview' && <Overview
          state={demo} onSchoolChange={changeSchool} onInspectTopic={inspectTopic} plan={currentAutoPlan}
          onRetry={() => demo.dataset ? retrySchool() : openDemo()}
        />}
        <DatasetControls hidden={active !== 'overview'} opened={!!demo.dataset} activeUpload={activeUpload} busy={demo.loading} action={datasetAction} error={datasetError} onDemo={openDemo} onUpload={uploadDataset} />
        {active === 'overview' && (!demo.dataset || demo.dataset.is_demo) && <DemoGuide opened={!!demo.dataset} topicSelected={!!selectedTopic} compared={compared} planned={!!currentAutoPlan} busy={demo.loading} onDemo={openDemo} onTopic={() => firstTopic ? inspectTopic(firstTopic) : navigate('topics')} onCompare={() => selectedTopic || firstTopic ? compareTopic(selectedTopic || firstTopic!) : navigate('textbooks')} onPlan={() => navigate('hours')} />}
        </div>
        {active === 'topic-detail' && demo.dataset && <TopicDetail
          key={JSON.stringify([demo.dataset.dataset_id, demo.overview?.school_id, selectedTopic])}
          dataset={demo.dataset} topicId={selectedTopic} schoolId={demo.overview?.school_id ?? ''}
          changingSchool={demo.loading} filterError={demo.error} plan={currentAutoPlan}
          onSchoolChange={changeSchool} onRetryFilter={retrySchool}
          onCompare={() => compareTopic(selectedTopic)} onPlan={() => navigate('hours')} onOverview={() => navigate('overview')}
        />}
        {active === 'topics' && <Topics
          key={JSON.stringify([demo.dataset?.dataset_id, demo.overview?.school_id])}
          dataset={demo.dataset} schoolId={demo.overview?.school_id ?? ''}
          changingSchool={demo.loading} filterError={demo.error}
          onSchoolChange={changeSchool} onRetryFilter={retrySchool}
          onCompareTopic={compareTopic} onInspectCell={changeSchool}
          onOverview={() => navigate('overview')}
        />}
        {active === 'textbooks' && <Textbooks
          key={demo.dataset?.dataset_id}
          dataset={demo.dataset} schoolId={demo.overview?.school_id ?? ''}
          topicId={selectedTopic} onTopicChange={setSelectedTopic}
          onPlan={() => navigate('hours')}
          changingSchool={demo.loading} filterError={demo.error}
          onSchoolChange={changeSchool} onRetryFilter={retrySchool}
          onOverview={() => navigate('overview')}
        />}
        {active === 'hours' && <Plan
          key={JSON.stringify([demo.dataset?.dataset_id, demo.overview?.school_id])}
          dataset={demo.dataset} schoolId={demo.overview?.school_id ?? ''}
          plan={plan} scenario={scenario} onScenarioChange={setScenario} invalidated={planInvalidated}
          focusTopic={selectedTopic}
          changingSchool={demo.loading} filterError={demo.error}
          onCalculated={result => { setPlan(result); setScenario(null); setPlanInvalidated(false) }}
          onSchoolChange={changeSchool} onRetryFilter={retrySchool}
          onOverview={() => navigate('overview')}
        />}
        <footer>Data-Driven Curriculum <span>Инструмент поддержки решений методиста</span></footer>
      </main>
    </div>
  </div>
}

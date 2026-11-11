import { useId, useState } from 'react'
import { curriculumApi, type PlanData, type PlanDraft } from './data/curriculum'
import './plan-explanation-draft.css'

export default function PlanExplanationDraft({ plan, disabled }: { plan: PlanData; disabled: boolean }) {
  const editorId = useId()
  const [source, setSource] = useState<PlanDraft['source'] | null>(null)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState('')

  async function generate() {
    if (loading || disabled) return

    setLoading(true)
    setError(null)
    try {
      const draft = await curriculumApi.createPlanDraft(plan.dataset_id, plan.plan_id)
      setText(draft.text)
      setSource(draft.source)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось подготовить пояснение.')
    } finally {
      setLoading(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus('Черновик скопирован.')
    } catch {
      setCopyStatus('Выделите текст в поле и скопируйте его вручную.')
    }
  }

  return <details className="plan-explanation-draft">
    <summary>Черновик пояснения к плану</summary>
    {source === null && <button type="button" className="secondary-button" disabled={disabled || loading} onClick={generate}>
      {loading ? 'Готовим черновик…' : 'Подготовить черновик'}
    </button>}
    <span className="sr-only" role="status">{loading ? 'Готовим черновик.' : source ? 'Черновик готов к редактированию.' : ''}</span>
    {error && <p className="error-message" role="alert">{error}</p>}
    {source && <div className="plan-draft-editor">
      <label htmlFor={editorId}>{source === 'openai' ? 'Черновик с ИИ' : 'Черновик по шаблону'}</label>
      <textarea id={editorId} value={text} rows={8} onChange={event => { setText(event.target.value); setCopyStatus('') }} />
      <div className="plan-draft-actions">
        <button type="button" className="secondary-button" onClick={copy} disabled={!text.trim()}>Скопировать текст</button>
        <span role="status">{copyStatus}</span>
      </div>
    </div>}
  </details>
}

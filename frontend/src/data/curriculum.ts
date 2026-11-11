export interface Dataset {
  dataset_id: string
  is_demo: boolean
  school_ids: string[]
}

export interface Scores {
  result_count: number
  post_score_avg: number | null
  below_threshold_pct: number | null
}

export interface OverviewData {
  dataset: Dataset
  school_id: string | null
  mastery_threshold: number
  student_count: number
  scores: Scores
  hardest_topics: { topic_id: string; topic_name: string; scores: Scores }[]
}

export interface CurriculumApi {
  uploadDataset(results: File, topics: File): Promise<Dataset>
  openDemoDataset(): Promise<Dataset>
  getOverview(datasetId: string, schoolId?: string): Promise<OverviewData>
  getTopics(datasetId: string, schoolId?: string): Promise<TopicsData>
  getTextbookComparison(datasetId: string, topicId: string, schoolId?: string): Promise<TextbookComparisonData>
  createPlan(datasetId: string, schoolId?: string): Promise<PlanData>
  transferPlanHours(datasetId: string, planId: string, transfer: TransferRequest): Promise<PlanData>
  createPlanDraft(datasetId: string, planId: string): Promise<PlanDraft>
  exportPlan(datasetId: string, planId: string): Promise<Blob>
}

export interface TransferRequest {
  from_topic_id: string
  to_topic_id: string
  hours: number
}

export interface ApiErrorDetail {
  message: string
  file?: string
  row?: number
  field?: string
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public details: ApiErrorDetail[] = []) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface PlanDraft {
  text: string
  source: 'openai' | 'template'
}

export interface PlanData {
  dataset_id: string
  plan_id: string
  school_id: string | null
  mastery_threshold: number
  status: 'recommended' | 'no_changes'
  explanation: string
  current_total_hours: number
  proposed_total_hours: number
  items: {
    topic_id: string
    topic_name: string
    current_hours: number
    proposed_hours: number
    delta_hours: number
    scores: Scores
    reason: string
  }[]
  transfers: { from_topic_id: string; to_topic_id: string; hours: number }[]
}

export interface TextbookComparisonData {
  dataset_id: string
  school_id: string | null
  topic_id: string
  groups: {
    textbook_id: string
    student_count: number
    pre_score_avg: number
    post_score_avg: number
    gain_avg: number
  }[]
  comparisons: {
    left_textbook_id: string
    right_textbook_id: string
    left_student_count: number
    right_student_count: number
    status: 'ok' | 'insufficient_data'
    gain_difference: number | null
  }[]
}

export interface TopicScores {
  topic_id: string
  topic_name: string
  scores: Scores
}

export interface TopicsData {
  dataset_id: string
  school_id: string | null
  mastery_threshold: number
  topics: TopicScores[]
  heatmap: { school_id: string; topic_id: string; scores: Scores }[]
}

async function requestResponse(path: string, method = 'GET', body?: object): Promise<Response> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      signal: AbortSignal.timeout(15000),
      ...(body === undefined ? {} : body instanceof FormData ? { body } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    })
  } catch {
    throw new Error('Не удалось связаться с сервером. Проверьте, что API запущен, и повторите запрос.')
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
      const details: ApiErrorDetail[] = 'details' in body && Array.isArray(body.details)
        ? body.details.filter((detail): detail is ApiErrorDetail => detail !== null && typeof detail === 'object' && typeof detail.message === 'string')
        : []
      throw new ApiError(body.message, response.status, details)
    }
    throw new Error(`Сервер недоступен или не смог обработать запрос (HTTP ${response.status}). Попробуйте ещё раз.`)
  }

  return response
}

async function request<T>(path: string, method = 'GET', body?: object): Promise<T> {
  const response = await requestResponse(path, method, body)
  try {
    return await response.json() as T
  } catch {
    throw new Error('Сервер вернул некорректный ответ. Повторите запрос.')
  }
}

export const curriculumApi: CurriculumApi = {
  uploadDataset(results, topics) {
    const form = new FormData()
    form.append('results', results)
    form.append('topics', topics)
    return request<Dataset>('/api/datasets', 'POST', form)
  },
  openDemoDataset() {
    return request<Dataset>('/api/datasets/demo', 'POST')
  },
  getOverview(datasetId, schoolId) {
    const query = schoolId ? `?${new URLSearchParams({ school_id: schoolId })}` : ''
    return request<OverviewData>(`/api/datasets/${encodeURIComponent(datasetId)}/overview${query}`)
  },
  getTopics(datasetId, schoolId) {
    const query = schoolId ? `?${new URLSearchParams({ school_id: schoolId })}` : ''
    return request<TopicsData>(`/api/datasets/${encodeURIComponent(datasetId)}/topics${query}`)
  },
  createPlan(datasetId, schoolId) {
    return request<PlanData>(`/api/datasets/${encodeURIComponent(datasetId)}/plans`, 'POST', schoolId ? { school_id: schoolId } : {})
  },
  transferPlanHours(datasetId, planId, transfer) {
    return request<PlanData>(`/api/datasets/${encodeURIComponent(datasetId)}/plans/${encodeURIComponent(planId)}/transfers`, 'POST', transfer)
  },
  createPlanDraft(datasetId, planId) {
    return request<PlanDraft>(`/api/datasets/${encodeURIComponent(datasetId)}/plans/${encodeURIComponent(planId)}/explanation-draft`, 'POST')
  },
  async exportPlan(datasetId, planId) {
    const response = await requestResponse(`/api/datasets/${encodeURIComponent(datasetId)}/plans/${encodeURIComponent(planId)}/export`)
    if (!response.headers.get('content-type')?.includes('text/csv')) throw new Error('Сервер вернул файл в неожиданном формате. Повторите скачивание.')
    return response.blob()
  },
  getTextbookComparison(datasetId, topicId, schoolId) {
    const query = new URLSearchParams({ topic_id: topicId })
    if (schoolId) query.set('school_id', schoolId)
    return request<TextbookComparisonData>(`/api/datasets/${encodeURIComponent(datasetId)}/textbook-comparison?${query}`)
  },
}

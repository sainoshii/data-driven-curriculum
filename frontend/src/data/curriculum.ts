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
  openDemoDataset(): Promise<Dataset>
  getOverview(datasetId: string, schoolId?: string): Promise<OverviewData>
  getTopics(datasetId: string, schoolId?: string): Promise<TopicsData>
  createPlan(datasetId: string, schoolId?: string): Promise<PlanData>
  exportPlan(datasetId: string, planId: string): Promise<Blob>
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
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    })
  } catch {
    throw new Error('Не удалось связаться с сервером. Проверьте, что API запущен, и повторите запрос.')
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
      throw new Error(body.message)
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
  async exportPlan(datasetId, planId) {
    const response = await requestResponse(`/api/datasets/${encodeURIComponent(datasetId)}/plans/${encodeURIComponent(planId)}/export`)
    if (!response.headers.get('content-type')?.includes('text/csv')) throw new Error('Сервер вернул файл в неожиданном формате. Повторите скачивание.')
    return response.blob()
  },
}

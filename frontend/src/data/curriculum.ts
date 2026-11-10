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
  getTextbookComparison(datasetId: string, topicId: string, schoolId?: string): Promise<TextbookComparisonData>
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

async function request<T>(path: string, method = 'GET'): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { method, signal: AbortSignal.timeout(15000) })
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
  getTextbookComparison(datasetId, topicId, schoolId) {
    const query = new URLSearchParams({ topic_id: topicId })
    if (schoolId) query.set('school_id', schoolId)
    return request<TextbookComparisonData>(`/api/datasets/${encodeURIComponent(datasetId)}/textbook-comparison?${query}`)
  },
}

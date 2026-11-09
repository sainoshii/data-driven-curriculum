import demoDataset from './mocks/demo-dataset.json'
import demoOverview from './mocks/demo-overview.json'
import schoolOverview from './mocks/demo-overview-s01.json'

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

// Replace this adapter with POST /api/datasets/demo and
// GET /api/datasets/{dataset_id}/overview[?school_id=...].
// Component code depends only on this asynchronous interface.
export interface CurriculumApi {
  supportedSchoolIds: readonly string[]
  openDemoDataset(): Promise<Dataset>
  getOverview(datasetId: string, schoolId?: string): Promise<OverviewData>
}

export const curriculumApi: CurriculumApi = {
  supportedSchoolIds: [schoolOverview.school_id],
  async openDemoDataset() {
    return structuredClone(demoDataset)
  },
  async getOverview(datasetId, schoolId) {
    if (datasetId !== demoDataset.dataset_id) {
      throw new Error('Демонстрационный набор не найден. Откройте демо ещё раз.')
    }
    if (schoolId !== undefined && schoolId !== schoolOverview.school_id) {
      throw new Error('Для этой школы пока нет демонстрационного примера.')
    }
    return structuredClone(schoolId === undefined ? demoOverview : schoolOverview)
  },
}

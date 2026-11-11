const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
let server, AnalysisSummary, UploadReceipt, DemoGuide, PlanComparison, comparisonRows, HeatmapCell
before(async () => {
  const { createServer } = await import('vite')
  server = await createServer({ root: path.join(__dirname, '..'), server: { middlewareMode: true }, appType: 'custom' })
  ;({ AnalysisSummary, UploadReceipt, DemoGuide } = await server.ssrLoadModule('/src/GuidedAnalysis.tsx'))
  ;({ default: PlanComparison, comparisonRows } = await server.ssrLoadModule('/src/PlanComparison.tsx'))
  ;({ HeatmapCell } = await server.ssrLoadModule('/src/Topics.tsx'))
})
after(async () => { await server?.close() })
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../../contracts/examples/demo-plan.json'), 'utf8'))
const topic = { topic_id: 'T08', topic_name: 'Разложение многочлена на множители', scores: { result_count: 2000, post_score_avg: 49.8315, below_threshold_pct: 75.5 } }
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props))

test('summary uses API percentage, sample and automatic hours, without scaling percentage', () => {
  const html = render(AnalysisSummary, { topic, threshold: 60, plan: fixture })
  assert.match(html, /75,5/)
  assert.doesNotMatch(html, /7550/)
  assert.match(html, /5 → 7 ч/)
  assert.match(html, /Предлагается добавить 2 ч/)
  assert.ok(html.includes(fixture.items.find(item => item.topic_id === 'T08').reason))
})

test('missing observations stay missing; no plan means no invented recommendation', () => {
  const html = render(AnalysisSummary, { topic: { ...topic, scores: { result_count: 0, post_score_avg: null, below_threshold_pct: null } }, threshold: 60, plan: null })
  assert.match(html, /нет данных о доле/)
  assert.match(html, /Нет данных/)
  assert.doesNotMatch(html, /0%|Предлагается добавить/)
})

test('three plan columns distinguish original, automatic and manual hours', () => {
  const manual = structuredClone(fixture)
  manual.items.find(item => item.topic_id === 'T08').proposed_hours = 6
  manual.items.find(item => item.topic_id === 'T11').proposed_hours = 8
  const row = comparisonRows(fixture, manual).find(row => row.id === 'T08')
  assert.deepEqual([row.current, row.automatic, row.manual], [5, 7, 6])
  const html = render(PlanComparison, { automatic: fixture, scenario: manual, focusTopic: 'T19' })
  assert.match(html, /T19/)
  assert.match(html, /focused-topic/)
  assert.match(html, /Тем с вашей правкой относительно автоматического плана: 2/)
  assert.match(html, /<td>119<\/td><td>119<\/td><td>119<\/td>/)
  assert.equal(comparisonRows(fixture, null)[0].manual, null)
})

test('upload confirmation shows full dataset counts and an analysis action', () => {
  const html = render(UploadReceipt, { receipt: { datasetId: 'uploaded', studentCount: 2000, schoolCount: 5, topicCount: 25, resultCount: 50000, resultsFile: 'results.csv', topicsFile: 'topics.csv' }, onStart() {} })
  for (const text of ['Файлы загружены', 'Школ', 'Тем', '25', 'results.csv', 'topics.csv', 'Начать анализ', 'Весь загруженный набор']) assert.ok(html.includes(text))
  assert.match(html, /50(?:\s|&nbsp;|&#xA0;)000/)
})

test('demo guide includes the four concrete actions', () => {
  const html = render(DemoGuide, { opened: false, topicSelected: false, compared: false, planned: false, busy: false })
  for (const text of ['Начать демо', 'Разобрать первую тему', 'Перейти к сравнению', 'Перейти к плану']) assert.ok(html.includes(text))
})

test('heatmap cells distinguish a clickable zero from missing results', () => {
  const props = { school: 'S01', topic, busy: false, onInspect() {} }
  const zero = render(HeatmapCell, { ...props, scores: { ...topic.scores, below_threshold_pct: 0 } })
  assert.match(zero, /<button[^>]+Разобрать тему T08 в школе S01[^>]+>0%<\/button>/)

  const missing = render(HeatmapCell, { ...props, scores: { result_count: 0, post_score_avg: null, below_threshold_pct: null } })
  assert.match(missing, />Нет данных<\/td>/)
  assert.doesNotMatch(missing, /<button/)
})

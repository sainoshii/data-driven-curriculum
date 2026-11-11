const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

let server, MethodistReportDocument, reportBudgets, validReportScope
before(async () => {
  const { createServer } = await import('vite')
  server = await createServer({ root: path.join(__dirname, '..'), server: { middlewareMode: true }, appType: 'custom' })
  ;({ MethodistReportDocument, reportBudgets, validReportScope } = await server.ssrLoadModule('/src/MethodistReport.tsx'))
})
after(async () => { await server?.close() })
const fixture = name => JSON.parse(fs.readFileSync(path.join(__dirname, '../../contracts/examples/', name), 'utf8'))
const automatic = fixture('demo-plan.json')
const manual = structuredClone(automatic)
manual.plan_id = 'manual-test'
for (const [id, hours] of [['T08', 6], ['T11', 8]]) {
  const item = manual.items.find(item => item.topic_id === id)
  item.proposed_hours = hours
  item.delta_hours = hours - item.current_hours
  item.reason = 'Ручной перенос методиста.'
}
const snapshot = { dataset: fixture('demo-dataset.json'), automatic, manual, topicId: 'T09', createdAt: '2026-11-11T12:00:00Z' }
const overview = fixture('demo-overview.json')
const comparison = fixture('demo-textbook-comparison-t09.json')
const render = overrides => renderToStaticMarkup(React.createElement(MethodistReportDocument, { snapshot, overview, comparison, comparisonError: null, ...overrides }))

test('report independently sums original, automatic and manual hours: 119 in each', () => {
  assert.deepEqual(reportBudgets(snapshot), { original: 119, automatic: 119, manual: 119, consistent: true })
  const html = render()
  assert.match(html, /Общий бюджет сохранён/)
  assert.match(html, /<td>119<\/td><td>119<\/td><td>119<\/td>/)
  assert.match(html, /T08[^<]*<\/th><td>5<\/td><td>7<\/td><td>6<\/td>/)
  assert.match(html, /T11[^<]*<\/th><td>5<\/td><td>7<\/td><td>8<\/td>/)
  const broken = structuredClone(snapshot)
  broken.manual.items[0].proposed_hours++
  assert.equal(reportBudgets(broken).consistent, false)
  assert.match(render({ snapshot: broken }), /Обнаружено расхождение бюджета/)
})

test('report preserves school/dataset scope, reasons and the synthetic label', () => {
  assert.equal(validReportScope(snapshot), true)
  assert.equal(validReportScope({ ...snapshot, manual: { ...manual, school_id: 'S01' } }), false)
  assert.equal(validReportScope({ ...snapshot, dataset: { ...snapshot.dataset, dataset_id: 'another' } }), false)
  const html = render()
  assert.match(html, /Синтетические демонстрационные данные/)
  assert.ok(html.includes(automatic.items.find(item => item.delta_hours !== 0).reason))
  assert.match(html, /Ручной перенос методиста/)
  assert.match(html, /Сохранённый план: manual-test/)
  const school = { ...snapshot, automatic: { ...automatic, school_id: 'S01' }, manual: null, dataset: { ...snapshot.dataset, is_demo: false } }
  const schoolHtml = render({ snapshot: school })
  assert.match(schoolHtml, /<dt>Школа<\/dt><dd>S01<\/dd>/)
  assert.match(schoolHtml, /Загруженный CSV-набор/)
  assert.doesNotMatch(schoolHtml, /Синтетические демонстрационные данные/)
})

test('missing manual variant, comparison failures and insufficient matched groups remain explicit', () => {
  assert.match(render({ snapshot: { ...snapshot, manual: null } }), /Ручной вариант не создан/)
  assert.match(render({ comparison: null, comparisonError: 'Сервер недоступен.' }), /Сравнение не включено: Сервер недоступен/)
  assert.match(render({ snapshot: { ...snapshot, topicId: '' }, comparison: null }), /Тема для сравнения не выбрана/)
  const insufficient = { ...comparison, comparisons: comparison.comparisons.map(pair => ({ ...pair, status: 'insufficient_data', gain_difference: null })) }
  assert.match(render({ comparison: insufficient }), /Недостаточно сопоставимых данных/)
  assert.match(render(), /левый минус правый/)
})

test('report shows exactly three hardest topics, keeps percentages in percent units and escapes server text', () => {
  const html = render({ overview: { ...overview, hardest_topics: [...overview.hardest_topics].reverse() } })
  assert.match(html, /75,5%/)
  const section = html.split('1. Три сложные темы')[1].split('2. Сравнение учебников')[0]
  assert.equal((section.match(/scope="row"/g) || []).length, 3)
  const escaped = render({ snapshot: { ...snapshot, automatic: { ...automatic, explanation: '<script>unsafe</script>' } } })
  assert.ok(escaped.includes('&lt;script&gt;unsafe&lt;/script&gt;'))
  assert.doesNotMatch(escaped, /<script>/)
})

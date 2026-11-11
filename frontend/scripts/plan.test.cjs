const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

let server, PlanResult, planMatchesScope, curriculumApi, summarizeSchools
before(async () => {
  const { createServer } = await import('vite')
  server = await createServer({ root: path.join(__dirname, '..'), server: { middlewareMode: true }, appType: 'custom' })
  ;({ PlanResult, planMatchesScope } = await server.ssrLoadModule('/src/Plan.tsx'))
  ;({ curriculumApi } = await server.ssrLoadModule('/src/data/curriculum.ts'))
  ;({ summarizeSchools } = await server.ssrLoadModule('/src/PlanSchoolContext.tsx'))
})
after(async () => { await server?.close() })
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../../contracts/examples/demo-plan.json'), 'utf8'))

test('shows saved budget, reasons and transfer endpoints from the contract', () => {
  const html = renderToStaticMarkup(React.createElement(PlanResult, { plan: fixture }))
  assert.match(html, /Бюджет сохранён/)
  assert.match(html, /119/)
  assert.match(html, /T01/)
  assert.match(html, /T08/)
  assert.match(html, /2 ч →/)
  assert.ok(html.includes(fixture.items[0].reason))
})

test('no_changes shows the API explanation and no transfers', () => {
  const plan = { ...fixture, status: 'no_changes', explanation: 'Нет допустимых переносов в выбранной школе.', transfers: [] }
  const html = renderToStaticMarkup(React.createElement(PlanResult, { plan }))
  assert.ok(html.includes(plan.explanation))
  assert.match(html, /План без изменений/)
  assert.match(html, /Переносов часов нет/)
})

test('automatic transfers show score evidence and the manual plan labels net changes', () => {
  const automatic = renderToStaticMarkup(React.createElement(PlanResult, { plan: fixture }))
  assert.match(automatic, /Почему этот перенос\?/)
  assert.match(automatic, /3,1%<\/b> ниже 60 баллов · выборка 2\s000/)
  assert.match(automatic, /75,5%<\/b> ниже 60 баллов · выборка 2\s000/)
  assert.match(automatic, /Часы темы в плане · 5 → 7 ч/)

  const manual = renderToStaticMarkup(React.createElement(PlanResult, { plan: fixture, isManual: true }))
  assert.match(manual, /итоговую разницу между исходным планом и вашим вариантом/)
  assert.match(manual, /2 ч →/)
  assert.doesNotMatch(manual, /Почему этот перенос\?|Правила автоматического расчёта/)
})

test('a plan belongs only to its dataset and school slice', () => {
  assert.equal(planMatchesScope(fixture, 'demo', ''), true)
  assert.equal(planMatchesScope(fixture, 'demo', 'S01'), false)
  assert.equal(planMatchesScope(fixture, 'other', ''), false)
})

test('school coverage includes the exact threshold and excludes small or empty groups', () => {
  const cell = (school_id, result_count, below_threshold_pct, topic_id = 'T08') => ({
    school_id, topic_id, scores: { result_count, below_threshold_pct, post_score_avg: null },
  })
  const result = summarizeSchools([
    cell('S01', 20, 50), cell('S02', 200, 49.99), cell('S03', 19, 90),
    cell('S04', 0, null), cell('S05', 200, 90, 'T09'),
  ], 'T08')
  assert.equal(result.difficult, 1)
  assert.equal(result.comparable, 2)
  assert.deepEqual(result.schools.map(school => school.below), [50, 49.99, null, null])
})

test('POST body and export URL use the requested slice and returned plan identity', async () => {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url, ...init })
    return url.endsWith('/export') ? new Response('topic_id,reason\nT01,test', { headers: { 'content-type': 'text/csv; charset=utf-8' } }) : Response.json(fixture)
  }
  try {
    const plan = await curriculumApi.createPlan('demo')
    await curriculumApi.createPlan('demo', 'S01')
    const blob = await curriculumApi.exportPlan(plan.dataset_id, plan.plan_id)
    assert.equal(calls[0].method, 'POST')
    assert.equal(calls[0].headers['Content-Type'], 'application/json')
    assert.deepEqual(JSON.parse(calls[0].body), {})
    assert.deepEqual(JSON.parse(calls[1].body), { school_id: 'S01' })
    assert.equal(calls[2].url, `/api/datasets/demo/plans/${plan.plan_id}/export`)
    assert.equal(calls[2].method, 'GET')
    assert.match(await blob.text(), /topic_id,reason/)
  } finally { globalThis.fetch = original }
})

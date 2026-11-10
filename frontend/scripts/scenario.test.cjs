const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
let server, curriculumApi, ScenarioChange, PlanScenario
before(async () => {
  const { createServer } = await import('vite')
  server = await createServer({ root: path.join(__dirname, '..'), server: { middlewareMode: true }, appType: 'custom' })
  ;({ curriculumApi } = await server.ssrLoadModule('/src/data/curriculum.ts'))
  ;({ default: PlanScenario, ScenarioChange } = await server.ssrLoadModule('/src/PlanScenario.tsx'))
})
after(async () => { await server?.close() })
const automatic = JSON.parse(fs.readFileSync(path.join(__dirname, '../../contracts/examples/demo-plan.json'), 'utf8'))
const manual = structuredClone(automatic)
manual.plan_id = 'manual-plan'
manual.items.find(item => item.topic_id === 'T08').proposed_hours = 6
manual.items.find(item => item.topic_id === 'T11').proposed_hours = 8
const transfer = { from_topic_id: 'T08', to_topic_id: 'T11', hours: 1 }
const scenario = { automaticPlanId: automatic.plan_id, plan: manual, change: { ...transfer, fromBefore: 7, fromAfter: 6, toBefore: 7, toAfter: 8 } }

test('shows actual before/after values and unchanged total', () => {
  const html = renderToStaticMarkup(React.createElement(ScenarioChange, { scenario }))
  assert.match(html, /7<\/td><td>6/)
  assert.match(html, /7<\/td><td>8/)
  assert.match(html, /Общий бюджет 119 ч/)
})

test('transfer POST uses current plan identity and exports each displayed variant', async () => {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url, ...init })
    return url.endsWith('/export') ? new Response('topic_id,proposed_hours\nT08,6', { headers: { 'content-type': 'text/csv' } }) : Response.json(manual, { status: 201 })
  }
  try {
    const result = await curriculumApi.transferPlanHours(automatic.dataset_id, automatic.plan_id, transfer)
    await curriculumApi.exportPlan(result.dataset_id, result.plan_id)
    await curriculumApi.exportPlan(automatic.dataset_id, automatic.plan_id)
    assert.equal(calls[0].url, `/api/datasets/demo/plans/${automatic.plan_id}/transfers`)
    assert.equal(calls[0].method, 'POST')
    assert.deepEqual(JSON.parse(calls[0].body), transfer)
    assert.equal(calls[1].url, '/api/datasets/demo/plans/manual-plan/export')
    assert.equal(calls[2].url, `/api/datasets/demo/plans/${automatic.plan_id}/export`)
    assert.equal(automatic.items.find(item => item.topic_id === 'T08').proposed_hours, 7)
  } finally { globalThis.fetch = original }
})

test('server rejection is surfaced and existing scenario values remain visible', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => Response.json({ message: 'Превышен максимум часов темы T11.', details: [] }, { status: 422 })
  try {
    await assert.rejects(() => curriculumApi.transferPlanHours('demo', manual.plan_id, transfer), /Превышен максимум/)
    const html = renderToStaticMarkup(React.createElement(PlanScenario, { plan: manual, scenario, busy: false, error: 'Превышен максимум часов темы T11.', onTransfer() {}, onRestore() {} }))
    assert.match(html, /Текущий вариант сохранён/)
    assert.match(html, /7<\/td><td>6/)
    assert.match(html, /7<\/td><td>8/)
    assert.match(html, /Вернуться к автоматическому плану/)
  } finally { globalThis.fetch = original }
})

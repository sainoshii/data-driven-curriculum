const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

// Use the application's own Vite transform; no HTTP listener or API calls.
let server
let ComparisonTables
before(async () => {
  const { createServer } = await import('vite')
  server = await createServer({ root: path.join(__dirname, '..'), server: { middlewareMode: true }, appType: 'custom' })
  ;({ ComparisonTables } = await server.ssrLoadModule('/src/Textbooks.tsx'))
})
after(async () => { await server?.close() })
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../../contracts/examples/demo-textbook-comparison-t09.json'), 'utf8'))
const render = data => renderToStaticMarkup(React.createElement(ComparisonTables, { data }))

test('renders API example: summary and matched sample sizes remain distinct', () => {
  const html = render(fixture)
  assert.match(html, /670/)
  assert.match(html, /637/)
  assert.match(html, /639/)
  assert.match(html, /\+9,84/)
  assert.match(html, /-0,43/)
  assert.match(html, /левый учебник минус правый/)
})

test('insufficient_data displays explanation instead of a numeric difference', () => {
  const data = structuredClone(fixture)
  data.comparisons = [{ ...data.comparisons[0], status: 'insufficient_data', gain_difference: null, left_student_count: 0, right_student_count: 0 }]
  const html = render(data)
  assert.match(html, /Недостаточно сопоставимых данных/)
  assert.doesNotMatch(html, /Нет данных/)
  assert.match(html, /<td>0<\/td><td>0<\/td>/)
})

test('zero difference is a result; null is missing data', () => {
  const data = structuredClone(fixture)
  data.comparisons = [{ ...data.comparisons[0], gain_difference: 0 }]
  assert.doesNotMatch(render(data), /Нет данных|Недостаточно сопоставимых данных/)
  assert.match(render(data), /<td>0<\/td>/)
  data.comparisons[0].gain_difference = null
  assert.match(render(data), /Нет данных/)
})

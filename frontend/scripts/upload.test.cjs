const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

let server, curriculumApi, ApiError, DatasetErrorMessage, DatasetBadge, DatasetControls
before(async () => {
  const { createServer } = await import('vite')
  server = await createServer({ root: path.join(__dirname, '..'), server: { middlewareMode: true }, appType: 'custom' })
  ;({ curriculumApi, ApiError } = await server.ssrLoadModule('/src/data/curriculum.ts'))
  ;({ default: DatasetControls, DatasetErrorMessage, DatasetBadge } = await server.ssrLoadModule('/src/DatasetControls.tsx'))
})
after(async () => { await server?.close() })

test('uploads the two files as FormData without setting Content-Type', async () => {
  const original = globalThis.fetch
  const files = [new File(['results'], 'results.csv'), new File(['topics'], 'topics.csv')]
  let call
  globalThis.fetch = async (url, init) => { call = { url, ...init }; return Response.json({ dataset_id: 'uploaded-123', is_demo: false, school_ids: ['S01'] }, { status: 201 }) }
  try {
    const dataset = await curriculumApi.uploadDataset(...files)
    assert.equal(dataset.dataset_id, 'uploaded-123')
    assert.equal(call.url, '/api/datasets')
    assert.equal(call.method, 'POST')
    assert.equal(call.headers, undefined)
    assert.ok(call.body instanceof FormData)
    assert.deepEqual([...call.body.keys()], ['results', 'topics'])
    assert.equal(await call.body.get('results').text(), 'results')
    assert.equal(await call.body.get('topics').text(), 'topics')
  } finally { globalThis.fetch = original }
})

test('HTTP 422 preserves server message, file, row and column for display', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => Response.json({ message: 'Проверьте CSV.', details: [{ file: 'results', row: 2, field: 'post_score', message: 'Балл вне диапазона.' }] }, { status: 422 })
  try {
    await assert.rejects(() => curriculumApi.uploadDataset(new File([''], 'r.csv'), new File([''], 't.csv')), error => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, 422)
      const html = renderToStaticMarkup(React.createElement(DatasetErrorMessage, { error }))
      for (const expected of ['Проверьте CSV.', 'results.csv', 'Строка: 2', 'post_score', 'Балл вне диапазона.', 'Открытый набор не изменён']) assert.ok(html.includes(expected))
      return true
    })
  } finally { globalThis.fetch = original }
})

test('badges distinguish uploaded data and demo; upload controls remain available', () => {
  assert.match(renderToStaticMarkup(React.createElement(DatasetBadge, { dataset: { is_demo: false } })), /Загруженные данные/)
  assert.match(renderToStaticMarkup(React.createElement(DatasetBadge, { dataset: { is_demo: true } })), /Демонстрационные данные/)
  const html = renderToStaticMarkup(React.createElement(DatasetControls, { busy: false, action: null, error: null, onDemo() {}, onUpload() {} }))
  assert.equal((html.match(/type="file"/g) || []).length, 2)
  assert.match(html, /Открыть демо/)
  assert.match(html, /Загрузить CSV/)
})

const fs = require('fs')
const path = require('path')
const { JSDOM } = require('jsdom')
const assert = require('assert')

const src = fs.readFileSync(path.join(__dirname, '..', 'deepseek-rtl.user.js'), 'utf8')
const injected = src.replace(/\}\)\(\);\s*$/, '  globalThis.__api = { scanImportantElements, stripMarks, unwrapWrappedSpans };\n})();\n')

function boot(body) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${body}</body></html>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://chat.deepseek.com/',
  })
  dom.window.eval(injected)
  return dom
}

const t = (name, fn) => { fn(); console.log('ok - ' + name) }

t('persian paragraph gets RTL class + number/emoji wrapped', () => {
  const dom = boot('<main><p class="message">سلام 123 دنیا 😀</p></main>')
  dom.window.__api.scanImportantElements()
  const p = dom.window.document.querySelector('p')
  assert.equal(p.classList.contains('rtl-assistant-persian'), true, 'persian class')
  assert.equal(p.querySelectorAll('span.rtl-assistant-ltr-number').length, 1, 'number wrapped')
  assert.equal(p.querySelectorAll('span.rtl-assistant-ltr-symbol, span.rtl-assistant-prefix-symbol').length, 1, 'emoji wrapped')
})

t('english paragraph gets LTR class and no wrapping', () => {
  const dom = boot('<main><p class="message">This is a long english sentence with many words here.</p></main>')
  dom.window.__api.scanImportantElements()
  const p = dom.window.document.querySelector('p')
  assert.equal(p.classList.contains('rtl-assistant-english'), true, 'english class')
  assert.equal(p.querySelectorAll('span[class*="rtl-assistant-"]').length, 0, 'no wrapping')
})

t('code blocks stay untouched (no class, no wrapping)', () => {
  const dom = boot('<main><div class="message"><pre><code>const x = 123; // 😀 سلام</code></pre></div></main>')
  dom.window.__api.scanImportantElements()
  const code = dom.window.document.querySelector('code')
  assert.equal(code.classList.contains('rtl-assistant-persian'), false)
  assert.equal(code.querySelectorAll('span[class*="rtl-assistant-"]').length, 0)
})

t('nested parent+child does not churn spans (no double wrap/unwrap)', () => {
  const dom = boot('<main><div class="message"><p>سلام 123 دنیا 😀</p></div></main>')
  dom.window.__api.scanImportantElements()
  const p = dom.window.document.querySelector('p')
  assert.equal(p.classList.contains('rtl-assistant-persian'), true, 'child handled')
  assert.equal(p.querySelectorAll('span.rtl-assistant-ltr-number').length, 1, 'number wrapped once')
})

t('force re-scan re-wraps numbers (stale-guard regression)', () => {
  const dom = boot('<main><p class="message">سلام 123 دنیا 😀</p></main>')
  const { scanImportantElements } = dom.window.__api
  scanImportantElements()
  scanImportantElements(true)
  const p = dom.window.document.querySelector('p')
  assert.equal(p.querySelectorAll('span.rtl-assistant-ltr-number').length, 1, 'still wrapped after force')
})

t('stripMarks restores plain text and clears markers', () => {
  const dom = boot('<main><p class="message">سلام 123 دنیا 😀</p></main>')
  const { scanImportantElements, stripMarks } = dom.window.__api
  scanImportantElements()
  stripMarks()
  const p = dom.window.document.querySelector('p')
  assert.equal(p.textContent, 'سلام 123 دنیا 😀', 'plain text restored')
  assert.equal(p.querySelectorAll('span[class*="rtl-assistant-"]').length, 0, 'spans gone')
  assert.equal(p.hasAttribute('data-rtl-processed'), false, 'marker cleared')
  assert.equal(p.classList.contains('rtl-assistant-persian'), false, 'class cleared')
})

t('scan is idempotent: repeated scans keep exactly one wrap', () => {
  const dom = boot('<main><p class="message">سلام 123 دنیا 😀</p></main>')
  const { scanImportantElements } = dom.window.__api
  for (let i = 0; i < 3; i++) scanImportantElements(true)
  const p = dom.window.document.querySelector('p')
  assert.equal(p.querySelectorAll('span.rtl-assistant-ltr-number').length, 1)
  assert.equal(p.querySelectorAll('span.rtl-assistant-ltr-symbol, span.rtl-assistant-prefix-symbol').length, 1)
})

t('OL list gets RTL direction for its Persian items', () => {
  const dom = boot('<main><ol class="message"><li>سلام دنیا</li><li>چطورید؟</li></ol></main>')
  dom.window.__api.scanImportantElements()
  const ol = dom.window.document.querySelector('ol')
  assert.equal(ol.classList.contains('rtl-assistant-persian'), true, 'OL gets RTL class')
})

console.log('all DOM tests passed')

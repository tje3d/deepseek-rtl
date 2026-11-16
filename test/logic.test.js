const fs = require('fs')
const path = require('path')
const vm = require('vm')
const assert = require('assert')

const src = fs.readFileSync(path.join(__dirname, '..', 'deepseek-rtl.user.js'), 'utf8')
const injected = src.replace(/\}\)\(\);\s*$/, '  globalThis.__logic = { analyzeText, decideAction };\n})();\n')

const noop = () => {}
const sandbox = {
  console,
  localStorage: { getItem: () => 'true', setItem: noop },
  document: { readyState: 'loading', addEventListener: noop },
  window: {},
  setTimeout: noop,
  clearTimeout: noop,
}
vm.createContext(sandbox)
vm.runInContext(injected, sandbox)
const { analyzeText, decideAction } = sandbox.__logic

const t = (name, fn) => { fn(); console.log('ok - ' + name) }

t('persian text is classified RTL', () => {
  const s = analyzeText('سلام دنیا، چطور هستید؟')
  assert.equal(s.hasRTL, true)
  assert.equal(decideAction(s), 'persian')
})

t('long english text is LTR', () => {
  const s = analyzeText('This is a fairly long english sentence with several words in it.')
  assert.equal(s.hasRTL, false)
  assert.equal(decideAction(s), 'english')
})

t('short english token wraps as persian', () => {
  const s = analyzeText('OK')
  assert.equal(decideAction(s), 'persian')
})

t('rtl-dominant with english tokens stays persian', () => {
  const s = analyzeText(' DeepSeek چطور کار میکند و خروجی خوبی میدهد ')
  assert.equal(s.hasRTL, true)
  assert.equal(decideAction(s), 'persian')
})

t('latin-only symbols return no direction', () => {
  const s = analyzeText('...')
  assert.equal(decideAction(s), null)
})

t('english-dominant with a little rtl is english', () => {
  const s = analyzeText('hello hello hello hello hello سلام')
  assert.equal(s.hasRTL, true)
  assert.equal(decideAction(s), 'english')
})

console.log('all logic tests passed')

// Real main-process session regression checks; run pnpm build first.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'
import { once } from 'node:events'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createTestState, launchTestApp } from './test-runtime.mjs'

const observer = 'http://127.0.0.1:9119'
const get = async (path) => {
  const response = await fetch(observer + path, { signal: AbortSignal.timeout(5000) })
  assert.ok(response.ok, await response.clone().text())
  return response.json()
}
async function until(read, predicate, timeout = 15000) {
  const deadline = Date.now() + timeout
  let value
  do {
    value = await read()
    if (predicate(value)) return value
    await delay(100)
  } while (Date.now() < deadline)
  throw new Error('Timed out waiting for expected session state: ' + JSON.stringify(value))
}
async function evaluate(js) {
  const result = await get('/overlay/eval?js=' + encodeURIComponent(js))
  assert.equal(result.ok, true)
  return result.result
}
async function assertPortFree() {
  let occupied = false
  try { await fetch(observer + '/ping', { signal: AbortSignal.timeout(1000) }); occupied = true } catch {}
  assert.equal(occupied, false, 'Observer port is occupied; do not test another instance')
}
const pages = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end('<!doctype html><title>Session test</title><h1>' + req.url + '</h1>')
})
pages.listen(0, '127.0.0.1')
await once(pages, 'listening')
const base = 'http://127.0.0.1:' + pages.address().port
const saved = (name) => ({
  tabs: [0, 1].map((n) => ({ url: base + '/' + name + '/' + n, title: name + n, favicon: null })),
  activeTabIndex: 1, savedAt: 1,
})
const urls = (tabs) => tabs.map((tab) => tab.url)
function seed(state) {
  const profiles = ['default', 'A', 'B', 'C'].map((id) => ({
    id, name: id, processNames: [], priority: 0, opacity: 1,
    windowBounds: { x: 100, y: 100, width: 900, height: 600 },
  }))
  const sessions = { A: saved('A'), B: saved('B'), C: { tabs: [], activeTabIndex: 0, savedAt: 1 } }
  writeFileSync(state.storePath, JSON.stringify({
    profiles, sessions,
    settings: {
      activeProfileId: 'A', startWithWindows: false, hasCompletedOnboarding: true,
      autoCreateProfiles: false, autoSwitchProfile: false, protectedDomains: [],
      blockedProcesses: [], nonGameDirs: [], gamePathHints: [], launcherExceptions: [],
      homepageUrl: base + '/home',
    },
  }))
  return sessions
}
const readSessions = (state) => JSON.parse(readFileSync(state.storePath, 'utf8')).sessions
let child
async function stop() {
  if (!child) return
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit', { signal: AbortSignal.timeout(10000) })
    child.send({ type: 'overframe-test:quit' })
    await exited
  }
  assert.equal(child.exitCode, 0, 'Graceful shutdown failed; inspect the isolated process.log')
  child = undefined
}
async function start(hidden) {
  await assertPortFree()
  const state = createTestState()
  const original = seed(state)
  child = launchTestApp(state, { hidden, stdio: 'pipe' })
  const log = []
  child.stdout.on('data', (data) => log.push(data.toString()))
  child.stderr.on('data', (data) => log.push(data.toString()))
  child.on('exit', () => writeFileSync(join(state.root, 'process.log'), log.join('')))
  const [configured] = await once(child, 'message', { signal: AbortSignal.timeout(10000) })
  assert.equal(configured.type, 'overframe-test:configured')
  assert.equal(configured.pid, child.pid)
  assert.equal(configured.userData, state.userData)
  assert.equal(configured.webView2, state.webView2)
  await until(async () => {
    assert.equal(child.exitCode, null, log.join(''))
    assert.equal(child.signalCode, null, log.join(''))
    try { return await get('/state') } catch { return null }
  }, (value) => value !== null, 30000)
  await until(() => evaluate('Boolean(window.aether)'), Boolean)
  console.log('Isolated runtime: ' + state.root + ' (PID ' + child.pid + ')')
  return { state, original }
}
const scenario = process.argv[2]
assert.ok(!scenario || ['hidden', 'hidden-quit', 'explicit-tab', 'profiles'].includes(scenario), 'Unknown session scenario')
try {
  // A/B: saved data survives both a real 15-second autosave opportunity and quit.
  if (!scenario || scenario === 'hidden') {
    const { state, original } = await start(true)
    assert.deepEqual((await get('/state')).tabs, [])
    await delay(16000)
    assert.deepEqual(readSessions(state), original)
    await stop()
    assert.deepEqual(readSessions(state), original)
    console.log('PASS hidden startup autosave and quit preserve saved sessions')
  }
  // B separately: quit before the first autosave as well as before first show.
  if (!scenario || scenario === 'hidden-quit') {
    const { state, original } = await start(true)
    await stop()
    assert.deepEqual(readSessions(state), original)
    console.log('PASS immediate hidden-startup quit preserves saved sessions')
  }
  // Explicit popup tab requests while hidden must restore before adding the URL.
  if (!scenario || scenario === 'explicit-tab') {
    const { state, original } = await start(true)
    await evaluate('window.aether.tabs.create(' + JSON.stringify(base + '/A/requested') + ')')
    const current = await get('/state')
    assert.notEqual(current.overlay, 'HIDDEN')
    assert.deepEqual(urls(current.tabs), [...urls(original.A.tabs), base + '/A/requested'])
    // Profile changes must go through the dedicated lifecycle IPC.
    assert.equal(await evaluate("window.aether.settings.set('activeProfileId', 'B')"), null)
    assert.equal((await get('/state')).activeProfile.id, 'A')
    await stop()
    assert.deepEqual(urls(readSessions(state).A.tabs), [...urls(original.A.tabs), base + '/A/requested'])
    assert.deepEqual(readSessions(state).B, original.B)
    console.log('PASS hidden explicit tab creation and profile-setting boundary')
  }
  // C/D/E/F: real profile IPC + deferred switching + legitimate empty saves.
  if (!scenario || scenario === 'profiles') {
    const { state, original } = await start(false)
    let current = await until(() => get('/state'), (s) => s.overlay !== 'HIDDEN' && s.tabs.length === 2)
    assert.deepEqual(urls(current.tabs), urls(original.A.tabs))
    assert.equal(current.tabs.find((tab) => tab.isActive).url, original.A.tabs[1].url)
    await evaluate('window.aether.tabs.create(' + JSON.stringify(base + '/A/live') + ')')
    await get('/overlay/hide')
    await evaluate("window.aether.profiles.setActive('B')")
    await delay(16000)
    assert.deepEqual(readSessions(state).B, original.B)
    assert.deepEqual(urls(readSessions(state).A.tabs), [...urls(original.A.tabs), base + '/A/live'])
    await get('/overlay/show')
    current = await until(() => get('/state'), (s) => s.overlay !== 'HIDDEN' && s.tabs.length === 2)
    assert.deepEqual(urls(current.tabs), urls(original.B.tabs))
    await evaluate('window.aether.tabs.create(' + JSON.stringify(base + '/B/live') + ')')
    await evaluate("window.aether.profiles.setActive('A')")
    current = await get('/state')
    assert.deepEqual(urls(current.tabs), [...urls(original.A.tabs), base + '/A/live'])
    assert.deepEqual(urls(readSessions(state).B.tabs), [...urls(original.B.tabs), base + '/B/live'])
    await evaluate("window.aether.profiles.setActive('C')")
    assert.deepEqual((await get('/state')).tabs, [])
    await evaluate('window.aether.tabs.create(' + JSON.stringify(base + '/C/new') + ')')
    await evaluate("window.aether.tabs.getAll().then(async ({tabs}) => { for (const tab of tabs) await window.aether.tabs.close(tab.id) })")
    await until(() => readSessions(state).C, (session) => session.savedAt !== 1 && session.tabs.length === 0)
    const screenshot = await fetch(observer + '/screenshot', { signal: AbortSignal.timeout(5000) })
    writeFileSync(join(state.root, 'overlay.png'), Buffer.from(await screenshot.arrayBuffer()))
    writeFileSync(join(state.root, 'renderer.log'), await (await fetch(observer + '/log/renderer', { signal: AbortSignal.timeout(5000) })).text())
    await stop()
    assert.deepEqual(readSessions(state).C.tabs, [])
    console.log('PASS visible restore, hidden/visible profile switches, and legitimate empty session')
  }
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    // Only terminate the child tree created by this harness if graceful shutdown failed.
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'])
    else child.kill('SIGKILL')
  }
  pages.close()
}

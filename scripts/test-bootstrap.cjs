// Test entry point only: configure isolation BEFORE importing the built app,
// whose electron-store instance is created during module evaluation.
const { app } = require('electron')
const { existsSync, mkdirSync, readFileSync, realpathSync } = require('node:fs')
const { isAbsolute, join, resolve } = require('node:path')

if (!app || app.isPackaged) throw new Error('The test bootstrap requires development Electron')

const requestedRoot = process.env.OVERFRAME_TEST_ROOT
if (!requestedRoot || !isAbsolute(requestedRoot)) throw new Error('Missing absolute test-state directory')
const root = realpathSync(requestedRoot)
if (readFileSync(join(root, '.overframe-test-state'), 'utf8') !== 'overframe-runtime-test\n') {
  throw new Error('Refusing to run without isolated test-state marker')
}

const userData = join(root, 'electron')
const sessionData = join(root, 'chromium')
const webView2 = join(root, 'webview2')
const crashDumps = join(root, 'crashes')
for (const directory of [userData, sessionData, webView2, crashDumps]) {
  mkdirSync(directory, { recursive: true })
  if (realpathSync(directory) !== directory) throw new Error('Test-state directories must not redirect elsewhere')
}
app.setPath('userData', userData)
app.setPath('sessionData', sessionData)
app.setPath('crashDumps', crashDumps)
// The Microsoft loader overrides the native addon's explicit userDataFolder:
// https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/webview2-idl#createcorewebview2environmentwithoptions
process.env.WEBVIEW2_USER_DATA_FOLDER = webView2

// Dev startup normally removes a login item. Tests must not alter the user's
// startup registration; this OS side effect is deliberately outside the check.
app.setLoginItemSettings = () => {
  console.log('[test-bootstrap] startup registration suppressed')
}

// Parent-only control channel for graceful shutdown/session-save verification.
// No HTTP endpoint or product IPC capability is added.
process.on('message', (message) => {
  if (message?.type === 'overframe-test:quit') app.quit()
})
process.once('disconnect', () => app.quit())

const entry = resolve(__dirname, '../out/main/index.js')
if (!existsSync(entry)) throw new Error('Built application missing; run pnpm build first')
process.send?.({ type: 'overframe-test:configured', pid: process.pid, entry, userData, sessionData, webView2 })
require(entry)

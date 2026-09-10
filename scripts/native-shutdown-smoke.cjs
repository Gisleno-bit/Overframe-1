// Independent Electron + production-addon regression. No session lifecycle or
// app bootstrap participates. Run after pnpm build:addon on Windows.
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')
const electron = require('electron')

async function run() {
  if (typeof electron === 'string') {
    const { createTestState } = await import('./test-runtime.mjs')
    for (const scenario of ['immediate', 'ready', 'recreate']) {
      const state = createTestState()
      const env = { ...process.env, OVERFRAME_TEST_ROOT: state.root, WEBVIEW2_USER_DATA_FOLDER: state.webView2 }
      for (const key of ['ELECTRON_RUN_AS_NODE', 'ELECTRON_NO_ATTACH_CONSOLE',
        'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS', 'WEBVIEW2_BROWSER_EXECUTABLE_FOLDER']) delete env[key]
      const result = spawnSync(electron, [__filename, scenario], {
        env, windowsHide: true, timeout: 20000, encoding: 'utf8',
      })
      const log = (result.stdout || '') + (result.stderr || '')
      writeFileSync(join(state.root, 'process.log'), log)
      assert.ifError(result.error)
      assert.equal(result.status, 0, scenario + ' shutdown failed: ' + state.root + '\n' + log)
      assert.match(log, /native-shutdown:will-quit/)
      console.log('PASS native shutdown ' + scenario + ': ' + state.root)
    }
    return
  }

  const { app, BrowserWindow } = electron
  const root = process.env.OVERFRAME_TEST_ROOT
  assert.ok(root, 'Run this check with Node so isolated data is configured')
  app.setPath('userData', join(root, 'electron'))
  app.setPath('sessionData', join(root, 'chromium'))
  app.setPath('crashDumps', root)
  process.env.WEBVIEW2_USER_DATA_FOLDER = join(root, 'webview2')
  const addon = require('../native/webview2-addon/build/Release/webview2_addon.node')
  let tab = null
  const closeTab = () => {
    if (tab === null) return
    addon.hide(tab)
    addon.destroyTab(tab)
    addon.destroyTab(tab) // repeat cleanup must remain harmless
    tab = null
  }
  app.on('window-all-closed', () => {})
  app.on('before-quit', closeTab)
  app.on('will-quit', () => console.log('native-shutdown:will-quit'))
  await app.whenReady()
  const createHost = async () => {
    const win = new BrowserWindow({ width: 900, height: 600, frame: false, transparent: true, show: false })
    await win.loadURL('data:text/html,<h1>Native shutdown regression</h1>')
    win.show()
    tab = addon.createTab(win.getNativeWindowHandle(), 0, 80, 900, 500)
    addon.navigate(tab, 'about:blank')
    addon.show(tab)
    return win
  }
  const win = await createHost()
  if (process.argv[2] === 'ready') {
    const deadline = Date.now() + 10000
    while (JSON.parse(await addon.executeScript(tab, 'document.readyState')) !== 'complete') {
      assert.ok(Date.now() < deadline, 'WebView2 document readiness timed out')
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  } else if (process.argv[2] === 'recreate') {
    closeTab()
    const closed = new Promise((resolve) => win.once('closed', resolve))
    win.close()
    await closed
    await createHost()
  }
  app.quit()
}

run().catch((error) => {
  console.error(error)
  if (typeof electron === 'string') process.exitCode = 1
  else electron.app.exit(1)
})

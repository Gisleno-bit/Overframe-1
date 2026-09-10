// Isolated state and launcher shared by real-app checks. Keep artifacts for
// inspection; this helper never deletes directories or touches normal app data.
import electronPath from 'electron'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = join(dirname(fileURLToPath(import.meta.url)), '..')

export function createTestState() {
  const root = mkdtempSync(join(tmpdir(), 'overframe-test-'))
  const state = {
    root,
    userData: join(root, 'electron'),
    sessionData: join(root, 'chromium'),
    webView2: join(root, 'webview2'),
  }
  for (const directory of [state.userData, state.sessionData, state.webView2]) {
    mkdirSync(directory)
  }
  writeFileSync(join(root, '.overframe-test-state'), 'overframe-runtime-test\n', { flag: 'wx' })
  return { ...state, storePath: join(state.userData, 'aether-store.json') }
}

export function launchTestApp(state, { hidden = false, stdio = 'ignore' } = {}) {
  const childEnv = {
    ...process.env,
    NODE_ENV: 'development',
    OVERFRAME_TEST_ROOT: state.root,
    WEBVIEW2_USER_DATA_FOLDER: state.webView2,
  }
  delete childEnv.ELECTRON_RUN_AS_NODE
  delete childEnv.ELECTRON_NO_ATTACH_CONSOLE
  // Always inspect this checkout's built renderer, not an inherited HMR server.
  delete childEnv.ELECTRON_RENDERER_URL
  // Exercise the addon's own compatibility options against the installed runtime.
  // Inherited diagnostic flags or a fixed-runtime override must not mask regressions.
  delete childEnv.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
  delete childEnv.WEBVIEW2_BROWSER_EXECUTABLE_FOLDER

  return spawn(electronPath, [join(repository, 'scripts', 'test-bootstrap.cjs'), ...(hidden ? ['--hidden'] : [])], {
    cwd: repository,
    env: childEnv,
    windowsHide: true,
    stdio: [stdio, stdio, stdio, 'ipc'],
  })
}

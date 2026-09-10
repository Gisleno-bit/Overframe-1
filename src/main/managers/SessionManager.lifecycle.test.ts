import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProfileSession, TabState } from '@shared/types'
import type { TabManager } from './TabManager'

const h = vi.hoisted(() => ({ sessions: {} as Record<string, ProfileSession> }))
vi.mock('../store', () => ({
  store: {
    get: (key: string) => key === 'sessions' ? h.sessions : undefined,
    set: (key: string, value: unknown) => {
      if (key === 'sessions') h.sessions = value as Record<string, ProfileSession>
    },
  },
}))

import { SessionManager } from './SessionManager'

function savedSession(profile: string, count = 2): ProfileSession {
  return {
    tabs: Array.from({ length: count }, (_, i) => ({
      url: `https://${profile}.example/${i}`,
      title: `${profile} ${i}`,
      favicon: null,
    })),
    activeTabIndex: Math.max(0, count - 1),
    savedAt: 1,
  }
}

/** Models observable tab contents, including creation/removal during restoration. */
function makeLiveTabs() {
  let tabs: TabState[] = []
  let activeId: string | null = null
  let nextId = 0
  const add = (url: string, title = '', favicon: string | null = null): TabState => {
    const tab: TabState = {
      id: `tab-${nextId++}`, url, title, favicon,
      isLoading: false, canGoBack: false, canGoForward: false,
      zoomFactor: 1, isAudioPlaying: false, isMuted: false,
    }
    tabs.push(tab)
    return tab
  }
  const api = {
    getAll: () => tabs,
    getActiveId: () => activeId,
    setActive: vi.fn((id: string) => {
      if (tabs.some((tab) => tab.id === id)) activeId = id
    }),
    createLazy: vi.fn(add),
    closeUnprotected: vi.fn((domains: string[]) => {
      tabs = tabs.filter((tab) => {
        const hostname = new URL(tab.url).hostname
        return domains.some((domain) => hostname === domain || hostname.endsWith('.' + domain))
      })
      if (!tabs.some((tab) => tab.id === activeId)) activeId = tabs[0]?.id ?? null
    }),
  }
  return {
    manager: api as unknown as TabManager,
    api,
    add,
    closeAll: () => { tabs = []; activeId = null },
    urls: () => tabs.map((tab) => tab.url),
    activeUrl: () => tabs.find((tab) => tab.id === activeId)?.url,
  }
}

beforeEach(() => {
  h.sessions = {}
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-10T12:00:00Z'))
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('SessionManager lifecycle', () => {
  it('preserves an unrestored session through hidden-startup autosave opportunities', () => {
    const saved = savedSession('A')
    h.sessions = { A: saved }
    const tabs = makeLiveTabs()
    const sessions = new SessionManager(tabs.manager)

    sessions.deferRestore('A')
    sessions.startAutoSave(() => 'A')
    vi.advanceTimersByTime(60_000)

    expect(h.sessions).toEqual({ A: saved })
    expect(tabs.urls()).toEqual([])
    sessions.stopAutoSave()
  })

  it('preserves the saved session when quitting before first show', () => {
    const saved = savedSession('A')
    h.sessions = { A: saved }
    const sessions = new SessionManager(makeLiveTabs().manager)

    sessions.deferRestore('A')
    // The shutdown path requests a save even if no restoration has occurred.
    sessions.save('A')
    sessions.stopAutoSave()

    expect(h.sessions).toEqual({ A: saved })
  })

  it('never saves profile A live tabs as a deferred profile B session', () => {
    const savedA = savedSession('A')
    const savedB = savedSession('B')
    h.sessions = { A: savedA, B: savedB }
    const tabs = makeLiveTabs()
    const sessions = new SessionManager(tabs.manager)
    let selectedProfile = 'A'
    sessions.restoreOrCreate(selectedProfile)
    const added = tabs.add('https://A.example/live', 'Live A')
    tabs.api.setActive(added.id)
    sessions.startAutoSave(() => selectedProfile)

    sessions.save(selectedProfile) // onBeforeSwitch, while A still owns the tabs
    selectedProfile = 'B' // hidden overlay defers B's restoration
    sessions.deferRestore(selectedProfile)
    vi.advanceTimersByTime(15_000)
    sessions.save(selectedProfile) // quitting or switching again while deferred

    expect(h.sessions.A.tabs.map((tab) => tab.url)).toEqual([
      ...savedA.tabs.map((tab) => tab.url), 'https://A.example/live',
    ])
    expect(h.sessions.A.activeTabIndex).toBe(2)
    expect(h.sessions.B).toEqual(savedB)
    expect(tabs.urls()).toEqual(h.sessions.A.tabs.map((tab) => tab.url))
    sessions.stopAutoSave()
  })

  it('preserves every unvisited profile when hidden startup changes profiles repeatedly', () => {
    const original = { A: savedSession('A'), B: savedSession('B'), C: savedSession('C') }
    h.sessions = { ...original }
    const tabs = makeLiveTabs()
    const sessions = new SessionManager(tabs.manager)
    let selectedProfile = 'A'
    sessions.deferRestore(selectedProfile)
    sessions.startAutoSave(() => selectedProfile)

    for (const next of ['B', 'C', 'A']) {
      sessions.save(selectedProfile)
      selectedProfile = next
      sessions.deferRestore(selectedProfile)
      vi.advanceTimersByTime(15_000)
    }
    expect(h.sessions).toEqual(original)
    expect(tabs.urls()).toEqual([])

    sessions.restorePending()
    expect(tabs.urls()).toEqual(original.A.tabs.map((tab) => tab.url))
    sessions.stopAutoSave()
  })

  it('restores visible startup contents and then autosaves legitimate edits', () => {
    const saved = savedSession('A')
    h.sessions = { A: saved }
    const tabs = makeLiveTabs()
    const sessions = new SessionManager(tabs.manager)

    sessions.deferRestore('A')
    sessions.restorePending()
    expect(tabs.urls()).toEqual(saved.tabs.map((tab) => tab.url))
    expect(tabs.activeUrl()).toBe(saved.tabs[1].url)
    const added = tabs.add('https://A.example/new', 'New')
    tabs.api.setActive(added.id)
    sessions.startAutoSave(() => 'A')
    vi.advanceTimersByTime(15_000)

    expect(h.sessions.A.tabs.map((tab) => tab.url)).toEqual(tabs.urls())
    expect(h.sessions.A.activeTabIndex).toBe(2)
    expect(h.sessions.A.savedAt).toBe(Date.now())
    sessions.stopAutoSave()
  })

  it.each([false, true])('preserves the selected duplicate URL after deferred restore (protected carryover: %s)', (carryProtected) => {
    const discord = { url: 'https://discord.com/app', title: 'Discord', favicon: null }
    const duplicate = { url: 'https://A.example/same', title: 'First copy', favicon: null }
    h.sessions = {
      A: { tabs: [discord, duplicate, { ...duplicate, title: 'Selected copy' }], activeTabIndex: 2, savedAt: 1 },
    }
    const tabs = makeLiveTabs()
    if (carryProtected) tabs.add(discord.url, discord.title)
    const sessions = new SessionManager(tabs.manager)
    sessions.deferRestore('A')

    sessions.restorePending(carryProtected ? ['discord.com'] : [])
    sessions.save('A')

    expect(tabs.urls()).toEqual([discord.url, duplicate.url, duplicate.url])
    expect(h.sessions.A.activeTabIndex).toBe(2)
    expect(h.sessions.A.tabs[h.sessions.A.activeTabIndex].title).toBe('Selected copy')
  })

  it('saves outgoing edits and restores the incoming session on normal profile switching', () => {
    const savedA = savedSession('A')
    const savedB = savedSession('B')
    h.sessions = { A: savedA, B: savedB }
    const tabs = makeLiveTabs()
    const sessions = new SessionManager(tabs.manager)
    sessions.restoreOrCreate('A')
    const addedA = tabs.add('https://A.example/new', 'New A')
    tabs.api.setActive(addedA.id)
    sessions.save('A')

    sessions.restore('B')
    expect(tabs.urls()).toEqual(savedB.tabs.map((tab) => tab.url))
    expect(tabs.activeUrl()).toBe(savedB.tabs[1].url)
    const addedB = tabs.add('https://B.example/new', 'New B')
    tabs.api.setActive(addedB.id)
    sessions.save('B')
    sessions.restore('A')

    expect(tabs.urls()).toEqual([...savedA.tabs.map((tab) => tab.url), addedA.url])
    expect(tabs.activeUrl()).toBe(addedA.url)
    expect(h.sessions.B.tabs.map((tab) => tab.url)).toEqual([
      ...savedB.tabs.map((tab) => tab.url), addedB.url,
    ])
    expect(h.sessions.B.activeTabIndex).toBe(2)
  })

  it.each(['missing', 'empty'] as const)('supports a %s profile and deliberately clearing its tabs', (kind) => {
    if (kind === 'empty') h.sessions = { A: savedSession('A', 0) }
    const tabs = makeLiveTabs()
    const sessions = new SessionManager(tabs.manager)

    sessions.restoreOrCreate('A')
    expect(tabs.urls()).toEqual([])
    const added = tabs.add('https://A.example/new', 'New')
    tabs.api.setActive(added.id)
    sessions.save('A')
    expect(h.sessions.A.tabs.map((tab) => tab.url)).toEqual([added.url])

    tabs.closeAll()
    sessions.save('A')
    expect(h.sessions.A).toEqual({ tabs: [], activeTabIndex: 0, savedAt: Date.now() })
  })

  it('makes a newly selected empty profile saveable after restoring it', () => {
    h.sessions = { A: savedSession('A'), B: savedSession('B', 0) }
    const tabs = makeLiveTabs()
    const sessions = new SessionManager(tabs.manager)
    sessions.restoreOrCreate('A')
    sessions.save('A')

    sessions.restore('B')
    expect(tabs.urls()).toEqual([])
    const added = tabs.add('https://B.example/new', 'New B')
    sessions.save('B')

    expect(h.sessions.B.tabs.map((tab) => tab.url)).toEqual([added.url])
    expect(h.sessions.A.tabs).toEqual(savedSession('A').tabs)
  })

  it('ignores a save request for a profile that does not own the live tabs', () => {
    const savedB = savedSession('B')
    h.sessions = { A: savedSession('A'), B: savedB }
    const sessions = new SessionManager(makeLiveTabs().manager)
    sessions.restoreOrCreate('A')

    sessions.save('B')

    expect(h.sessions.B).toEqual(savedB)
  })

  it('restores only the latest deferred profile once and preserves edits on later shows', () => {
    h.sessions = { A: savedSession('A') }
    const tabs = makeLiveTabs()
    const sessions = new SessionManager(tabs.manager)
    sessions.deferRestore('unvisited')
    sessions.deferRestore('A')
    expect(tabs.urls()).toEqual([])
    sessions.restorePending()
    const added = tabs.add('https://A.example/live', 'Live')
    tabs.api.setActive(added.id)
    const expected = tabs.urls()

    sessions.restorePending()

    expect(tabs.urls()).toEqual(expected)
    expect(tabs.activeUrl()).toBe(added.url)
  })

  it('blocks stale outgoing saves as well as incoming saves while restoration is deferred', () => {
    h.sessions = { A: savedSession('A'), B: savedSession('B') }
    const tabs = makeLiveTabs()
    const sessions = new SessionManager(tabs.manager)
    sessions.restoreOrCreate('A')
    sessions.save('A')
    const beforeSwitch = { ...h.sessions }

    sessions.deferRestore('B')
    tabs.closeAll() // a late tab event must not overwrite either saved session
    sessions.save('A')
    sessions.save('B')

    expect(h.sessions).toEqual(beforeSwitch)
    sessions.restorePending()
    expect(tabs.urls()).toEqual(beforeSwitch.B.tabs.map((tab) => tab.url))
  })

  it('preserves and retries the pending session after a partial restoration failure', () => {
    const saved = savedSession('B')
    h.sessions = { B: saved }
    const tabs = makeLiveTabs()
    const sessions = new SessionManager(tabs.manager)
    sessions.deferRestore('B')
    tabs.api.createLazy.mockImplementationOnce(tabs.add).mockImplementationOnce(() => {
      throw new Error('native tab creation failed')
    })

    expect(() => sessions.restorePending()).toThrow('native tab creation failed')
    sessions.save('B')
    expect(h.sessions.B).toEqual(saved)

    sessions.restorePending()
    expect(tabs.urls()).toEqual(saved.tabs.map((tab) => tab.url))
    expect(tabs.activeUrl()).toBe(saved.tabs[1].url)
    sessions.save('B')
    expect(h.sessions.B).toEqual({ ...saved, savedAt: Date.now() })
  })

  it('makes a deferred empty session ready for legitimate later autosaves', () => {
    const tabs = makeLiveTabs()
    const sessions = new SessionManager(tabs.manager)
    sessions.deferRestore('new')
    sessions.restorePending()
    sessions.startAutoSave(() => 'new')

    vi.advanceTimersByTime(15_000)
    expect(h.sessions.new).toEqual({ tabs: [], activeTabIndex: 0, savedAt: Date.now() })
    const added = tabs.add('https://new.example/page', 'New page')
    vi.advanceTimersByTime(15_000)
    expect(h.sessions.new.tabs.map((tab) => tab.url)).toEqual([added.url])
    sessions.stopAutoSave()
  })

  it('preserves the final saved session after disposal and shutdown tab removal', () => {
    h.sessions = { A: savedSession('A') }
    const tabs = makeLiveTabs()
    const sessions = new SessionManager(tabs.manager)
    sessions.restoreOrCreate('A')
    const added = tabs.add('https://A.example/final', 'Final page')
    tabs.api.setActive(added.id)
    sessions.startAutoSave(() => 'A')
    sessions.save('A')
    const finalSession = h.sessions.A

    sessions.dispose()
    expect(vi.getTimerCount()).toBe(0)
    tabs.closeAll()
    sessions.save('A')
    vi.advanceTimersByTime(60_000)
    sessions.dispose()

    expect(h.sessions.A).toEqual(finalSession)
  })

  it('preserves the incoming saved session if restoration fails after creating a tab', () => {
    const savedB = savedSession('B')
    h.sessions = { A: savedSession('A'), B: savedB }
    const tabs = makeLiveTabs()
    const sessions = new SessionManager(tabs.manager)
    sessions.restoreOrCreate('A')
    sessions.save('A')
    tabs.api.createLazy.mockImplementationOnce(tabs.add).mockImplementationOnce(() => {
      throw new Error('native tab creation failed')
    })

    expect(() => sessions.restore('B')).toThrow('native tab creation failed')
    sessions.save('B')
    expect(h.sessions.B).toEqual(savedB)
  })

  it('does not overwrite a session with a partial snapshot during restoration callbacks', () => {
    const savedA = savedSession('A')
    h.sessions = { A: savedA }
    const tabs = makeLiveTabs()
    const sessions = new SessionManager(tabs.manager)
    sessions.restoreOrCreate('A')
    tabs.api.createLazy.mockImplementation((url, title, favicon) => {
      const tab = tabs.add(url, title, favicon)
      sessions.save('A')
      return tab
    })

    sessions.restore('A')

    expect(h.sessions.A).toEqual(savedA)
    expect(tabs.urls()).toEqual(savedA.tabs.map((tab) => tab.url))
  })

  it('preserves intentional protected-tab carryover without duplicating saved protected tabs', () => {
    const discord = { url: 'https://discord.com/app', title: 'Discord', favicon: null }
    const savedA = savedSession('A', 1)
    const savedB = savedSession('B', 1)
    h.sessions = {
      A: { ...savedA, tabs: [discord, ...savedA.tabs] },
      B: { ...savedB, tabs: [discord, ...savedB.tabs], activeTabIndex: 1 },
    }
    const tabs = makeLiveTabs()
    const sessions = new SessionManager(tabs.manager)
    sessions.restoreOrCreate('A')
    sessions.save('A')

    sessions.restore('B', ['discord.com'])
    sessions.save('B')

    expect(tabs.urls()).toEqual([discord.url, savedB.tabs[0].url])
    expect(tabs.activeUrl()).toBe(savedB.tabs[0].url)
    expect(h.sessions.B.tabs.map((tab) => tab.url)).toEqual(tabs.urls())
    expect(h.sessions.A.tabs.map((tab) => tab.url)).toEqual([discord.url, savedA.tabs[0].url])
  })
})

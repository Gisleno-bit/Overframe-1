import { store } from '../store'
import type { ProfileSession } from '@shared/types'
import type { TabManager } from './TabManager'

const AUTO_SAVE_INTERVAL_MS = 15_000

export class SessionManager {
  private autoSaveHandle: NodeJS.Timeout | null = null
  /** The live tab set may be persisted only after a complete restoration. */
  private readyProfileId: string | null = null
  private pendingProfileId: string | null = null

  constructor(
    private tabs: TabManager,
  ) {}

  save(profileId: string): void {
    if (this.readyProfileId !== profileId || this.pendingProfileId !== null) return

    // getAll() now returns tabs in visual display order
    const allTabs = this.tabs.getAll()
    const activeId = this.tabs.getActiveId()

    const httpTabs = allTabs.filter(
      (t) => t.url.startsWith('http://') || t.url.startsWith('https://')
    )

    const activeIndex = Math.max(0, httpTabs.findIndex((t) => t.id === activeId))

    const session: ProfileSession = {
      tabs: httpTabs.map((t) => ({ url: t.url, title: t.title, favicon: t.favicon })),
      activeTabIndex: Math.max(0, activeIndex),
      savedAt: Date.now(),
    }

    const sessions = store.get('sessions')
    store.set('sessions', { ...sessions, [profileId]: session })
  }

  /** Select a session without creating/loading its tabs while the overlay is hidden. */
  deferRestore(profileId: string): void {
    this.readyProfileId = null
    this.pendingProfileId = profileId
  }

  /** Restore only the latest selection, once. Keep it pending if restoration throws. */
  restorePending(protectedDomains: string[] = []): void {
    if (this.pendingProfileId === null) return
    this.restore(this.pendingProfileId, protectedDomains)
    this.pendingProfileId = null
  }

  /** On startup: restore saved session or show home page if none exists. */
  restoreOrCreate(profileId: string): void {
    this.readyProfileId = null
    this.restoreInitialTabs(profileId)
    this.readyProfileId = profileId
  }

  private restoreInitialTabs(profileId: string): void {
    const session = store.get('sessions')[profileId]
    if (!session || session.tabs.length === 0) return
    const targetIndex = Math.min(session.activeTabIndex, session.tabs.length - 1)
    const createdIds: string[] = []
    for (const t of session.tabs) {
      // All tabs start lazy — setActive() below will trigger loading for the active one only.
      const tab = this.tabs.createLazy(t.url, t.title, t.favicon ?? null)
      createdIds.push(tab.id)
    }
    this.tabs.setActive(createdIds[targetIndex])
  }

  restore(profileId: string, protectedDomains: string[] = []): void {
    // Tab events can request saves during replacement. Failed/partial restores
    // must never become authoritative, even when restoring the same profile.
    this.readyProfileId = null
    this.restoreTabs(profileId, protectedDomains)
    this.readyProfileId = profileId
  }

  private restoreTabs(profileId: string, protectedDomains: string[]): void {
    const session = store.get('sessions')[profileId]

    // Close current tabs except protected domains (e.g. Discord calls).
    this.tabs.closeUnprotected(protectedDomains)

    // After closeUnprotected(), find which protected base-domains still have an open tab.
    // We won't reopen session tabs that belong to an already-open protected domain —
    // otherwise switching between two profiles that both have Discord would create duplicates.
    const coveredDomains = new Set<string>()
    if (protectedDomains.length) {
      for (const tab of this.tabs.getAll()) {
        try {
          const { hostname } = new URL(tab.url)
          for (const d of protectedDomains) {
            if (hostname === d || hostname.endsWith('.' + d)) coveredDomains.add(d)
          }
        } catch { /* destroyed or non-http */ }
      }
    }

    const isAlreadyCovered = (url: string): boolean => {
      if (!coveredDomains.size) return false
      try {
        const { hostname } = new URL(url)
        return protectedDomains.some(
          (d) => coveredDomains.has(d) && (hostname === d || hostname.endsWith('.' + d))
        )
      } catch { return false }
    }

    // No saved session or nothing to restore → show home page (activeTabId → null).
    if (!session || session.tabs.length === 0) return

    const tabsToRestore = session.tabs.filter((t) => !isAlreadyCovered(t.url))

    // All saved tabs were protected-domain duplicates → home page, don't open a redundant tab.
    if (tabsToRestore.length === 0) return

    // Preserve the originally active tab if it wasn't filtered out; otherwise use the first.
    const savedActive = session.tabs[session.activeTabIndex]
    // filter() preserves object identity, including distinct tabs with the same URL.
    const filteredIndex = savedActive ? tabsToRestore.indexOf(savedActive) : -1
    const activeRestoreIndex = filteredIndex !== -1 ? filteredIndex : 0

    const createdIds: string[] = []
    for (const t of tabsToRestore) {
      // All tabs start lazy — setActive() below triggers loading for the active one only.
      const tab = this.tabs.createLazy(t.url, t.title, t.favicon ?? null)
      createdIds.push(tab.id)
    }
    this.tabs.setActive(createdIds[activeRestoreIndex])
  }

  startAutoSave(getProfileId: () => string): void {
    if (this.autoSaveHandle) return
    this.autoSaveHandle = setInterval(() => {
      this.save(getProfileId())
    }, AUTO_SAVE_INTERVAL_MS)
  }

  dispose(): void {
    this.stopAutoSave()
    // Shutdown closes tabs and can emit debounced save requests afterwards.
    this.readyProfileId = null
    this.pendingProfileId = null
  }

  stopAutoSave(): void {
    if (this.autoSaveHandle) {
      clearInterval(this.autoSaveHandle)
      this.autoSaveHandle = null
    }
  }
}

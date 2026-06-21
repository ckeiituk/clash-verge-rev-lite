import type { NavigateFunction } from 'react-router-dom'
import { t } from 'i18next'

type PopoverButton = 'next' | 'previous' | 'close'

type PopoverConfig = {
  title?: string
  description?: string
  side?: 'top' | 'right' | 'bottom' | 'left' | 'over'
  align?: 'start' | 'center' | 'end'
  showButtons?: PopoverButton[]
  onNextClick?: (element: Element | undefined, step: DriveStep, options: DriverStepOptions) => void
  onCloseClick?: (element: Element | undefined, step: DriveStep, options: DriverStepOptions) => void
}

type DriveStep = {
  element?: string | Element | (() => Element | null)
  popover?: PopoverConfig
  onHighlighted?: (
    element: Element | undefined,
    step: DriveStep,
    options: DriverStepOptions
  ) => void
  onDeselected?: (element: Element | undefined, step: DriveStep, options: DriverStepOptions) => void
}

type PopoverDOM = {
  wrapper: HTMLElement
  arrow: HTMLElement
  title: HTMLElement
  description: HTMLElement
  footer: HTMLElement
  footerButtons: HTMLElement
  previousButton: HTMLElement
  nextButton: HTMLElement
  closeButton: HTMLElement
  progress: HTMLElement
}

type DriverConfig = {
  showProgress?: boolean
  showButtons?: PopoverButton[]
  allowClose?: boolean
  nextBtnText?: string
  prevBtnText?: string
  doneBtnText?: string
  progressText?: string
  overlayOpacity?: number
  steps: DriveStep[]
  onDestroyed?: () => void
  onCloseClick?: (element: Element | undefined, step: DriveStep, options: DriverStepOptions) => void
  onPopoverRender?: (
    popover: PopoverDOM,
    options: { config: DriverConfig; state: unknown; driver: Driver }
  ) => void
}

type Driver = {
  drive: (stepIndex?: number) => void
  destroy: () => void
  moveNext: () => void
  refresh?: () => void
}

type DriverFactory = (config: DriverConfig) => Driver

type DriverStepOptions = {
  driver: Driver
}

type StartTourOptions = {
  onMainGuideCompleted?: () => void
}

type AutoClickStepOptions = {
  element: string | (() => Element | null)
  title: string
  description: string
  side?: 'top' | 'right' | 'bottom' | 'left' | 'over'
  align?: 'start' | 'center' | 'end'
  waitFor?: string | string[]
  afterClick?: () => Promise<void> | void
}

type AutoAdvanceStepOptions = {
  element: string | (() => Element | null)
  title: string
  description: string
  side?: 'top' | 'right' | 'bottom' | 'left' | 'over'
  align?: 'start' | 'center' | 'end'
  isCompleted: () => boolean
  nextDelayMs?: number
}

type GuideMode = 'default' | 'deep-link' | 'admin-required'

let driverInstance: Driver | null = null
let cssLoaded = false
let guideMode: GuideMode = 'default'
let stopGuideModeObserver: (() => void) | null = null
let isSwitchingGuideMode = false
let onMainGuideCompleted: (() => void) | null = null
let isMainGuideCompleted = false
let F11Count = 0
let f11ResetTimeout: number | null = null
let removeTourExitHotkeyListener: (() => void) | null = null
let isStartingTour = false

const GUIDE_SELECTORS = {
  addProfileButton: '[data-guide="home-add-profile-btn"]',
  profileImportUrlInput: '[data-guide="profile-import-url-input"]',
  profileImportPasteButton: '[data-guide="profile-import-paste-btn"]',
  profileImportButton: '[data-guide="profile-import-submit"]',
  profileInstallConfirmModal: '.guide-profile-install-modal',
  adminRequiredModal: '.guide-admin-required-modal',
  profileHeader: '[data-guide="home-profile-header"]',
  profileAnnounce: '[data-guide="home-profile-announce"]',
  powerButton: '[data-guide="home-power-toggle"]',
  groupSelector: '[data-guide="home-group-selector"]',
  supportButton: '[data-guide="home-support-link"]',
  firstProxyGroup: '[data-guide="proxies-first-group"]',
  firstProxyGroupRows: '[data-guide="proxies-first-group-row"]',
  sidebar: '[data-guide="app-sidebar"]',
  sidebarHomeButton: '[data-guide="sidebar-home-button"]'
} as const

const WAIT_TIMEOUT_MS = 45_000
const WAIT_INTERVAL_MS = 120
const FIRST_PROXY_GROUP_OVERLAY_ID = 'guide-first-group-overlay'

type CancelSignal = { aborted: boolean }

function clearGuideModeObserver(): void {
  stopGuideModeObserver?.()
  stopGuideModeObserver = null
}

function clearTourExitHotkeyListener(): void {
  F11Count = 0
  if (f11ResetTimeout !== null) {
    window.clearTimeout(f11ResetTimeout)
    f11ResetTimeout = null
  }
  removeTourExitHotkeyListener?.()
  removeTourExitHotkeyListener = null
}

function ensureTourExitHotkeyListener(): void {
  if (removeTourExitHotkeyListener) return

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'F11') return

    event.preventDefault()

    if (f11ResetTimeout !== null) window.clearTimeout(f11ResetTimeout)
    F11Count++
    f11ResetTimeout = window.setTimeout(() => {
      F11Count = 0
      f11ResetTimeout = null
    }, 3000)

    if (F11Count < 5) return

    F11Count = 0
    driverInstance?.destroy()
  }

  window.addEventListener('keydown', handleKeyDown)
  removeTourExitHotkeyListener = (): void => {
    window.removeEventListener('keydown', handleKeyDown)
  }
}

function markMainGuideCompleted(): void {
  if (isMainGuideCompleted) return

  isMainGuideCompleted = true
  onMainGuideCompleted?.()
}

async function loadDriverModule(): Promise<{ driver: DriverFactory }> {
  if (!cssLoaded) {
    await import('driver.js/dist/driver.css')
    cssLoaded = true
  }
  return import('driver.js') as Promise<{ driver: DriverFactory }>
}

function resolveElement(selector: string): Element | null {
  return document.querySelector(selector)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function waitForAnyElement(
  selectors: readonly string[],
  timeoutMs = WAIT_TIMEOUT_MS,
  signal?: CancelSignal
): Promise<Element> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()

    const check = (): void => {
      if (signal?.aborted) {
        reject(new Error('Aborted'))
        return
      }

      const element = selectors.map(resolveElement).find(Boolean)
      if (element) {
        resolve(element)
        return
      }

      if (Date.now() - startTime >= timeoutMs) {
        reject(new Error(`Guide timeout waiting for ${selectors.join(', ')}`))
        return
      }

      setTimeout(check, WAIT_INTERVAL_MS)
    }

    check()
  })
}

function waitForElement(
  selector: string,
  timeoutMs = WAIT_TIMEOUT_MS,
  signal?: CancelSignal
): Promise<Element> {
  return waitForAnyElement([selector], timeoutMs, signal)
}

function isValidHttpUrl(value: string): boolean {
  if (!value) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function removeFirstProxyGroupOverlay(): void {
  document.getElementById(FIRST_PROXY_GROUP_OVERLAY_ID)?.remove()
}

function getFirstProxyGroupHighlightElement(): Element | null {
  const firstGroupHeader = resolveElement(GUIDE_SELECTORS.firstProxyGroup)
  if (!firstGroupHeader) return null

  const headerRect = firstGroupHeader.getBoundingClientRect()
  const rowRects = Array.from(document.querySelectorAll(GUIDE_SELECTORS.firstProxyGroupRows))
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0)

  const allRects = [headerRect, ...rowRects].filter((rect) => rect.width > 0 && rect.height > 0)
  if (allRects.length === 0) return firstGroupHeader

  const margin = 8
  const top = Math.max(0, Math.min(...allRects.map((rect) => rect.top)) - margin)
  const left = Math.max(0, Math.min(...allRects.map((rect) => rect.left)) - margin)
  const right = Math.min(
    window.innerWidth,
    Math.max(...allRects.map((rect) => rect.right)) + margin
  )
  const bottom = Math.min(
    window.innerHeight,
    Math.max(...allRects.map((rect) => rect.bottom)) + margin
  )

  let overlay = document.getElementById(FIRST_PROXY_GROUP_OVERLAY_ID) as HTMLDivElement | null
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = FIRST_PROXY_GROUP_OVERLAY_ID
    overlay.style.position = 'fixed'
    overlay.style.pointerEvents = 'none'
    overlay.style.background = 'transparent'
    overlay.style.borderRadius = '16px'
    overlay.style.zIndex = '2147483640'
    document.body.appendChild(overlay)
  }

  overlay.style.top = `${top}px`
  overlay.style.left = `${left}px`
  overlay.style.width = `${Math.max(0, right - left)}px`
  overlay.style.height = `${Math.max(0, bottom - top)}px`

  return overlay
}

function createAutoClickStep({
  element,
  title,
  description,
  side = 'bottom',
  align = 'center',
  waitFor,
  afterClick
}: AutoClickStepOptions): DriveStep {
  let detachClickListener: (() => void) | null = null
  let isWaiting = false
  let cancelSignal: CancelSignal | null = null

  const waitForTarget = async (signal: CancelSignal): Promise<void> => {
    if (waitFor) {
      if (Array.isArray(waitFor)) {
        await waitForAnyElement(waitFor, WAIT_TIMEOUT_MS, signal)
      } else {
        await waitForElement(waitFor, WAIT_TIMEOUT_MS, signal)
      }
    }

    if (!signal.aborted) {
      await afterClick?.()
    }
  }

  return {
    element,
    popover: {
      title,
      description,
      side,
      align,
      showButtons: ['previous']
    },
    onHighlighted: (highlightedElement, _step, options): void => {
      detachClickListener?.()
      isWaiting = false
      if (cancelSignal) cancelSignal.aborted = true
      const signal: CancelSignal = { aborted: false }
      cancelSignal = signal

      if (!highlightedElement) return

      const onClick = async (): Promise<void> => {
        if (isWaiting || signal.aborted) return
        isWaiting = true

        try {
          await waitForTarget(signal)
          if (!signal.aborted) options.driver.moveNext()
        } catch {
          isWaiting = false
        }
      }

      highlightedElement.addEventListener('click', onClick)
      detachClickListener = (): void => {
        highlightedElement.removeEventListener('click', onClick)
      }
    },
    onDeselected: (): void => {
      detachClickListener?.()
      detachClickListener = null
      isWaiting = false
      if (cancelSignal) cancelSignal.aborted = true
    }
  }
}

function startAutoAdvanceWatcher(isCompleted: () => boolean, onCompleted: () => void): () => void {
  let isStopped = false

  const runCheck = (): void => {
    if (isStopped || !isCompleted()) return

    try {
      onCompleted()
    } finally {
      stop()
    }
  }

  const scheduleCheck = (): void => {
    window.setTimeout(runCheck, 0)
  }

  const triggerEvents: (keyof DocumentEventMap)[] = [
    'click',
    'input',
    'change',
    'keyup',
    'paste',
    'submit'
  ]

  const stop = (): void => {
    if (isStopped) return

    isStopped = true
    window.clearInterval(intervalId)
    triggerEvents.forEach((eventName) => {
      document.removeEventListener(eventName, scheduleCheck, true)
    })
  }

  triggerEvents.forEach((eventName) => {
    document.addEventListener(eventName, scheduleCheck, true)
  })

  const intervalId = window.setInterval(runCheck, WAIT_INTERVAL_MS)

  runCheck()

  return stop
}

function createAutoAdvanceStep({
  element,
  title,
  description,
  side = 'bottom',
  align = 'center',
  isCompleted,
  nextDelayMs = 0
}: AutoAdvanceStepOptions): DriveStep {
  let stopWatcher: (() => void) | null = null
  let pendingMoveNextTimeout: number | null = null

  const clearPendingMoveNext = (): void => {
    if (pendingMoveNextTimeout === null) return
    window.clearTimeout(pendingMoveNextTimeout)
    pendingMoveNextTimeout = null
  }

  return {
    element,
    popover: {
      title,
      description,
      side,
      align,
      showButtons: ['previous']
    },
    onHighlighted: (_highlightedElement, _step, options): void => {
      stopWatcher?.()
      clearPendingMoveNext()
      stopWatcher = startAutoAdvanceWatcher(isCompleted, () => {
        if (nextDelayMs > 0) {
          pendingMoveNextTimeout = window.setTimeout(() => {
            pendingMoveNextTimeout = null
            options.driver.moveNext()
          }, nextDelayMs)
          return
        }
        options.driver.moveNext()
      })
    },
    onDeselected: (): void => {
      stopWatcher?.()
      stopWatcher = null
      clearPendingMoveNext()
    }
  }
}

function buildGuideSteps(mode: GuideMode = 'default'): DriveStep[] {
  const hasNoProfilesState = Boolean(resolveElement(GUIDE_SELECTORS.addProfileButton))
  const steps: DriveStep[] = []

  if (mode === 'admin-required') {
    steps.push(
      createAutoAdvanceStep({
        element: () =>
          resolveElement(GUIDE_SELECTORS.adminRequiredModal) ??
          resolveElement(GUIDE_SELECTORS.powerButton) ??
          resolveElement(GUIDE_SELECTORS.addProfileButton),
        title: t('guide.adminRequiredTitle'),
        description: t('guide.adminRequiredDesc'),
        side: 'top',
        isCompleted: () => !resolveElement(GUIDE_SELECTORS.adminRequiredModal)
      })
    )
  }

  if (mode === 'default') {
    steps.push({
      popover: {
        title: t('guide.welcome'),
        description: t('guide.welcomeDesc'),
        side: 'over',
        align: 'center',
        showButtons: ['next']
      }
    })
  }

  if (mode === 'deep-link') {
    steps.push(
      createAutoAdvanceStep({
        element: () =>
          resolveElement(GUIDE_SELECTORS.profileInstallConfirmModal) ??
          resolveElement(GUIDE_SELECTORS.profileHeader) ??
          resolveElement(GUIDE_SELECTORS.powerButton),
        title: t('guide.deepLinkImportTitle'),
        description: t('guide.deepLinkImportDesc'),
        side: 'top',
        isCompleted: () => Boolean(resolveElement(GUIDE_SELECTORS.profileHeader))
      })
    )
  } else if (hasNoProfilesState) {
    steps.push(
      createAutoAdvanceStep({
        element: () =>
          resolveElement(GUIDE_SELECTORS.profileInstallConfirmModal) ??
          resolveElement(GUIDE_SELECTORS.addProfileButton),
        title: t('guide.addProfileTitle'),
        description: t('guide.addProfileDesc'),
        side: 'top',
        isCompleted: () =>
          Boolean(
            resolveElement(GUIDE_SELECTORS.profileImportUrlInput) ??
            resolveElement(GUIDE_SELECTORS.profileInstallConfirmModal) ??
            resolveElement(GUIDE_SELECTORS.profileHeader)
          )
      }),
      createAutoAdvanceStep({
        element: () =>
          resolveElement(GUIDE_SELECTORS.profileInstallConfirmModal) ??
          resolveElement(GUIDE_SELECTORS.profileImportPasteButton) ??
          resolveElement(GUIDE_SELECTORS.profileHeader) ??
          resolveElement(GUIDE_SELECTORS.powerButton),
        title: t('guide.insertLinkTitle'),
        description: t('guide.insertLinkDesc'),
        side: 'left',
        align: 'center',
        isCompleted: () => {
          const profileHeader = resolveElement(GUIDE_SELECTORS.profileHeader)
          const urlInput = resolveElement(
            GUIDE_SELECTORS.profileImportUrlInput
          ) as HTMLInputElement | null

          if (profileHeader && !urlInput) return true
          if (resolveElement(GUIDE_SELECTORS.profileInstallConfirmModal)) return true

          return Boolean(urlInput && isValidHttpUrl(urlInput.value.trim()))
        }
      }),
      createAutoAdvanceStep({
        element: () =>
          resolveElement(GUIDE_SELECTORS.profileInstallConfirmModal) ??
          resolveElement(GUIDE_SELECTORS.profileImportButton) ??
          resolveElement(GUIDE_SELECTORS.profileHeader) ??
          resolveElement(GUIDE_SELECTORS.powerButton),
        title: t('guide.importProfileTitle'),
        description: t('guide.importProfileDesc'),
        side: 'top',
        isCompleted: () => Boolean(resolveElement(GUIDE_SELECTORS.profileHeader))
      })
    )
  }

  steps.push(
    {
      element: () =>
        resolveElement(GUIDE_SELECTORS.profileHeader) ??
        resolveElement(GUIDE_SELECTORS.powerButton),
      popover: {
        title: t('guide.profileHeaderTitle'),
        description: t('guide.profileHeaderDesc'),
        side: 'bottom'
      }
    },
    {
      element: () =>
        resolveElement(GUIDE_SELECTORS.profileAnnounce) ??
        resolveElement(GUIDE_SELECTORS.profileHeader) ??
        resolveElement(GUIDE_SELECTORS.powerButton),
      popover: {
        title: t('guide.profileAnnounceTitle'),
        description: t('guide.profileAnnounceDesc'),
        side: 'bottom'
      }
    },
    createAutoClickStep({
      element: GUIDE_SELECTORS.powerButton,
      title: t('guide.powerButtonTitle'),
      description: t('guide.powerButtonDesc'),
      side: 'top',
      waitFor: GUIDE_SELECTORS.groupSelector,
      afterClick: () => sleep(500)
    }),
    createAutoClickStep({
      element: GUIDE_SELECTORS.groupSelector,
      title: t('guide.groupSelectorTitle'),
      description: t('guide.groupSelectorDesc'),
      side: 'top',
      waitFor: GUIDE_SELECTORS.firstProxyGroup
    }),
    createAutoAdvanceStep({
      element: GUIDE_SELECTORS.firstProxyGroup,
      title: t('guide.firstGroupTitle'),
      description: t('guide.firstGroupDesc'),
      side: 'bottom',
      align: 'start',
      isCompleted: () => {
        const firstGroup = resolveElement(GUIDE_SELECTORS.firstProxyGroup)
        return firstGroup?.getAttribute('data-guide-open') === 'true'
      },
      nextDelayMs: 140
    }),
    {
      element: () =>
        getFirstProxyGroupHighlightElement() ?? resolveElement(GUIDE_SELECTORS.firstProxyGroup),
      popover: {
        title: t('guide.firstGroupExpandedTitle'),
        description: t('guide.firstGroupExpandedDesc'),
        side: 'bottom',
        align: 'start'
      },
      onHighlighted: (_element, _step, options): void => {
        window.setTimeout(() => {
          getFirstProxyGroupHighlightElement()
          options.driver.refresh?.()
        }, 60)
      },
      onDeselected: (): void => {
        removeFirstProxyGroupOverlay()
      }
    },
    {
      element: GUIDE_SELECTORS.sidebar,
      popover: {
        title: t('guide.sidebarTitle'),
        description: t('guide.sidebarDesc'),
        side: 'right'
      }
    },
    createAutoClickStep({
      element: GUIDE_SELECTORS.sidebarHomeButton,
      title: t('guide.sidebarHomeTitle'),
      description: t('guide.sidebarHomeDesc'),
      side: 'right',
      waitFor: [GUIDE_SELECTORS.powerButton, GUIDE_SELECTORS.addProfileButton]
    }),
    {
      element: GUIDE_SELECTORS.supportButton,
      popover: {
        title: t('guide.supportTitle'),
        description: t('guide.supportDesc'),
        side: 'top',
        align: 'center'
      }
    },
    {
      popover: {
        title: t('guide.tutorialEnd'),
        description: t('guide.tutorialEndDesc'),
        side: 'over',
        align: 'center',
        onNextClick: (_element, _step, options): void => {
          markMainGuideCompleted()
          options.driver.destroy()
        }
      }
    }
  )

  return steps
}

async function createDriverWithMode(mode: GuideMode): Promise<Driver> {
  if (driverInstance) {
    driverInstance.destroy()
    driverInstance = null
  }

  const { driver } = await loadDriverModule()

  guideMode = mode
  driverInstance = driver({
    allowClose: false,
    showProgress: true,
    showButtons: ['next', 'previous'],
    nextBtnText: t('guide.nextStep'),
    prevBtnText: t('guide.prevStep'),
    doneBtnText: t('guide.done'),
    progressText: '{{current}} / {{total}}',
    overlayOpacity: 0.9,
    steps: buildGuideSteps(mode),
    onCloseClick: (_element, _step, options): void => {
      markMainGuideCompleted()
      options.driver.destroy()
    },
    onPopoverRender: (popover): void => {
      const skipButton = document.createElement('button')
      skipButton.innerText = t('guide.skipTour')
      skipButton.className = 'driver-popover-close-btn driver-popover-skip-btn'
      popover.footerButtons.appendChild(skipButton)
    },
    onDestroyed: (): void => {
      removeFirstProxyGroupOverlay()
      clearGuideModeObserver()
      clearTourExitHotkeyListener()
      guideMode = 'default'
      driverInstance = null
    }
  })
  ensureTourExitHotkeyListener()
  startGuideModeObserverLoop(driverInstance)

  return driverInstance
}

async function restartGuideInMode(mode: GuideMode): Promise<void> {
  if (isSwitchingGuideMode || guideMode === mode) return

  isSwitchingGuideMode = true
  try {
    const d = await createDriverWithMode(mode)
    d.drive()
  } finally {
    isSwitchingGuideMode = false
  }
}

function switchGuideModeIfNeeded(driver: Driver): void {
  if (isSwitchingGuideMode) return
  if (driver !== driverInstance) return

  if (resolveElement(GUIDE_SELECTORS.adminRequiredModal)) {
    if (guideMode !== 'admin-required') {
      void restartGuideInMode('admin-required').catch(() => {
        driverInstance?.destroy()
      })
    }
    return
  }

  if (guideMode === 'default' && resolveElement(GUIDE_SELECTORS.profileInstallConfirmModal)) {
    void restartGuideInMode('deep-link').catch(() => {
      driverInstance?.destroy()
    })
  }
}

function startGuideModeObserverLoop(driver: Driver): void {
  clearGuideModeObserver()

  if (typeof MutationObserver === 'undefined') return
  if (!document.body) return

  const observer = new MutationObserver(() => {
    switchGuideModeIfNeeded(driver)
  })
  observer.observe(document.body, { childList: true, subtree: true })
  switchGuideModeIfNeeded(driver)
  stopGuideModeObserver = (): void => {
    observer.disconnect()
  }
}

export async function createDriver(_navigate: NavigateFunction): Promise<Driver> {
  return createDriverWithMode('default')
}

export async function startTour(
  navigate: NavigateFunction,
  options: StartTourOptions = {}
): Promise<void> {
  if (isStartingTour) return
  isStartingTour = true

  try {
    onMainGuideCompleted = options.onMainGuideCompleted ?? null
    isMainGuideCompleted = false

    navigate('/home')
    await sleep(120)

    try {
      await waitForAnyElement(
        [
          GUIDE_SELECTORS.addProfileButton,
          GUIDE_SELECTORS.powerButton,
          GUIDE_SELECTORS.profileInstallConfirmModal,
          GUIDE_SELECTORS.adminRequiredModal
        ],
        15_000
      )
    } catch {
      // ignore and let driver fallback to dynamic element resolvers
    }

    const d = await createDriver(navigate)
    d.drive()

    if (resolveElement(GUIDE_SELECTORS.adminRequiredModal)) {
      await restartGuideInMode('admin-required')
    } else if (resolveElement(GUIDE_SELECTORS.profileInstallConfirmModal)) {
      await restartGuideInMode('deep-link')
    }
  } finally {
    isStartingTour = false
  }
}

import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const subscribe = React.useCallback((callback: () => void) => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    mql.addEventListener("change", callback)
    return () => mql.removeEventListener("change", callback)
  }, [])

  const getSnapshot = React.useCallback(() => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches, [])
  const getServerSnapshot = React.useCallback(() => false, [])

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

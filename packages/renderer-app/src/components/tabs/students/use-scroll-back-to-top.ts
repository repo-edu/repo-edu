import { useCallback, useEffect, useRef, useState } from "react"

/** Minimum scroll fraction before the back-to-top button appears.
 *  Avoids showing the button when only a small amount has been scrolled. */
const SCROLL_TOP_THRESHOLD = 0.15

/** Tracks vertical scroll on a container and exposes a back-to-top affordance. */
export function useScrollBackToTop() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showBackToTop, setShowBackToTop] = useState(false)

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const maxScroll = el.scrollHeight - el.clientHeight
    setShowBackToTop(
      maxScroll > 0 && el.scrollTop / maxScroll > SCROLL_TOP_THRESHOLD,
    )
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateScrollState()
    el.addEventListener("scroll", updateScrollState, { passive: true })
    const observer = new ResizeObserver(updateScrollState)
    observer.observe(el)
    return () => {
      el.removeEventListener("scroll", updateScrollState)
      observer.disconnect()
    }
  }, [updateScrollState])

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
  }, [])

  return { scrollRef, showBackToTop, scrollToTop }
}

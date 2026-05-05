import { useEffect, useState } from "react"

export function useElapsedSeconds(active: boolean): number | null {
  const [seconds, setSeconds] = useState<number | null>(null)

  useEffect(() => {
    if (!active) {
      setSeconds(null)
      return
    }
    const start = Date.now()
    setSeconds(0)
    const interval = setInterval(() => {
      setSeconds(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [active])

  return seconds
}

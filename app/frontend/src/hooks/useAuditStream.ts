import { useEffect, useRef, useState } from 'react'
import type { AuditEvent } from '../types'

export function useAuditStream() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    function connect() {
      const es = new EventSource('/api/audit/stream')
      esRef.current = es

      es.onmessage = (e: MessageEvent) => {
        const event = JSON.parse(e.data as string) as AuditEvent
        setEvents(prev => [event, ...prev].slice(0, 150))
      }

      es.onerror = () => {
        es.close()
        setTimeout(connect, 3000)
      }
    }

    connect()
    return () => esRef.current?.close()
  }, [])

  return events
}

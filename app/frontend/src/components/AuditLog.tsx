import { useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScrollText } from 'lucide-react'
import clsx from 'clsx'
import { useAuditStream } from '../hooks/useAuditStream'
import type { AuditEvent } from '../types'

const OP_STYLES: Record<string, { color: string; bg: string }> = {
  'transit/encrypt':          { color: 'text-purple-400',  bg: 'bg-purple-900/20' },
  'transit/decrypt':          { color: 'text-blue-400',    bg: 'bg-blue-900/20' },
  'transit/keys/rotate':      { color: 'text-amber-400',   bg: 'bg-amber-900/20' },
  'database/creds':           { color: 'text-green-400',   bg: 'bg-green-900/20' },
  'sys/leases/revoke-force':  { color: 'text-red-400',     bg: 'bg-red-900/20' },
  'auth/aws/iam':             { color: 'text-vault-400',   bg: 'bg-vault-900/20' },
  'auth/token':               { color: 'text-vault-400',   bg: 'bg-vault-900/20' },
  'secret/data/read':         { color: 'text-sky-400',     bg: 'bg-sky-900/20' },
  'transit/convergent':       { color: 'text-amber-400',   bg: 'bg-amber-900/20' },
}

function opStyle(op: string) {
  for (const [key, style] of Object.entries(OP_STYLES)) {
    if (op.startsWith(key)) return style
  }
  return { color: 'text-slate-400', bg: 'bg-slate-800/40' }
}

function eventDetail(event: AuditEvent): string {
  const { operation, path, extra } = event
  if (operation === 'transit/encrypt') {
    const suffix = extra.convergent ? '  ·  convergent' : ''
    return extra.field ? `${String(extra.field)} → vault:v*:...${suffix}` : path
  }
  if (operation === 'transit/convergent') {
    return extra.enabled ? 'convergent mode enabled' : 'convergent mode disabled'
  }
  if (operation === 'database/creds') {
    const user = extra.username ? `user: ${String(extra.username)}` : path
    const ttl = extra.ttl ? `  ·  expires in ${String(extra.ttl)}s` : ''
    return user + ttl
  }
  if (operation === 'sys/leases/revoke-force') {
    return `all leases force-revoked · ${path}`
  }
  if (operation === 'transit/keys/rotate') {
    return extra.version ? `key version bumped → v${String(extra.version)}` : path
  }
  if (operation === 'auth/aws/iam') {
    return extra.method ? `${path}  ·  ${String(extra.method)}` : path
  }
  return path
}

function EventRow({ event }: { event: AuditEvent }) {
  const style = opStyle(event.operation)
  const ts = new Date(event.timestamp)
  const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20, height: 0 }}
      animate={{ opacity: 1, x: 0, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className={clsx(
        'flex items-start gap-3 px-3 py-2 rounded-lg border border-transparent',
        'hover:border-slate-700/50 transition-colors',
        style.bg,
      )}
    >
      <span className="font-mono text-[10px] text-slate-600 whitespace-nowrap pt-0.5 w-20 shrink-0">
        {timeStr}
      </span>
      <span className={clsx('font-mono text-xs font-medium whitespace-nowrap shrink-0 w-52', style.color)}>
        {event.operation}
      </span>
      <span className="font-mono text-xs text-slate-500 truncate">
        {eventDetail(event)}
      </span>
      <span className={clsx(
        'ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0',
        event.status === 'SUCCESS'
          ? 'bg-green-900/30 text-green-400'
          : 'bg-red-900/30 text-red-400',
      )}>
        {event.status}
      </span>
    </motion.div>
  )
}

export default function AuditLog() {
  const events = useAuditStream()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  return (
    <div className="card">
      <div className="card-header">
        <ScrollText className="w-4 h-4 text-slate-400" />
        <span className="label">Vault Audit Log</span>
        <span className="text-xs text-slate-600">live · all operations independently logged</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-green-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Streaming
        </span>
      </div>

      <div className="h-52 overflow-y-auto space-y-0.5 pr-1">
        {events.length === 0 && (
          <div className="h-full flex items-center justify-center text-slate-700 text-sm">
            Waiting for Vault operations…
          </div>
        )}
        <AnimatePresence initial={false}>
          {[...events].reverse().map((e, i) => (
            <EventRow key={`${e.timestamp}-${i}`} event={e} />
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      <div className="mt-3 pt-3 border-t border-slate-800 flex gap-4 text-[10px] text-slate-600">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-purple-900/60 border border-purple-700/40" /> encrypt/decrypt</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-900/60 border border-green-700/40" /> db creds</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-900/60 border border-amber-700/40" /> key rotation</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-900/60 border border-red-700/40" /> revocation</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-vault-900/60 border border-vault-700/40" /> auth</span>
      </div>
    </div>
  )
}

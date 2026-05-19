import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { KeyRound, User, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import { getVaultStatus } from '../api'
import type { CredentialInfo } from '../types'

function TtlRing({ info }: { info: CredentialInfo }) {
  const [now, setNow] = useState(Date.now() / 1000)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 1000)
    return () => clearInterval(id)
  }, [])

  const remaining = Math.max(0, info.expires_at - now)
  const fraction = remaining / info.ttl
  const circumference = 2 * Math.PI * 22
  const dash = fraction * circumference

  const color =
    fraction > 0.5 ? '#14b8a6' : fraction > 0.25 ? '#f59e0b' : '#ef4444'

  const mins = Math.floor(remaining / 60)
  const secs = Math.floor(remaining % 60)

  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <div className="relative w-16 h-16">
        <svg viewBox="0 0 48 48" className="w-full h-full -rotate-90">
          <circle cx="24" cy="24" r="22" fill="none" stroke="#1e293b" strokeWidth="3.5" />
          <motion.circle
            cx="24"
            cy="24"
            r="22"
            fill="none"
            stroke={color}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            animate={{ strokeDasharray: `${dash} ${circumference}`, stroke: color }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-[10px] font-bold leading-none" style={{ color }}>
            {mins}:{secs.toString().padStart(2, '0')}
          </span>
        </div>
      </div>
      <span className="text-[10px] text-slate-500">TTL</span>
    </div>
  )
}

export default function CredentialPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['vaultStatus'],
    queryFn: getVaultStatus,
    refetchInterval: 5000,
  })

  const [prevUser, setPrevUser] = useState<string | null>(null)
  const [justRotated, setJustRotated] = useState(false)

  useEffect(() => {
    if (!data) return
    const user = data.credential.username
    if (prevUser && prevUser !== user) {
      setJustRotated(true)
      setTimeout(() => setJustRotated(false), 2500)
    }
    setPrevUser(user)
  }, [data?.credential.username])

  if (isLoading || !data) {
    return (
      <div className="card animate-pulse">
        <div className="h-4 w-32 bg-slate-800 rounded mb-3" />
        <div className="h-20 bg-slate-800 rounded" />
      </div>
    )
  }

  const { credential } = data

  return (
    <div className={clsx('card transition-all duration-500', justRotated && 'ring-1 ring-vault-500')}>
      <div className="card-header">
        <KeyRound className="w-4 h-4 text-vault-400" />
        <span className="label text-vault-400">Active DB Credential</span>
        <AnimatePresence>
          {justRotated && (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="ml-auto flex items-center gap-1 text-xs text-vault-400"
            >
              <RefreshCw className="w-3 h-3 animate-spin" />
              Rotated
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0 space-y-3">
          <div>
            <div className="flex items-center gap-1 mb-1">
              <User className="w-3 h-3 text-slate-500" />
              <span className="label">Username</span>
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={credential.username}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="font-mono text-sm text-green-400 truncate"
              >
                {credential.username}
              </motion.p>
            </AnimatePresence>
          </div>

          <div>
            <span className="label block mb-1">Password</span>
            <p className="font-mono text-sm text-slate-600 tracking-widest">••••••••••••••••</p>
          </div>

          <div>
            <span className="label block mb-1">Lease ID</span>
            <p className="font-mono text-[9px] text-slate-600 truncate">{credential.lease_id}</p>
          </div>
        </div>

        <TtlRing info={credential} />
      </div>
    </div>
  )
}

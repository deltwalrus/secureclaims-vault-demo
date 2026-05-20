import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { RotateCw, Lock, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'
import { getVaultStatus, rotateKey, getConvergent, setConvergent } from '../api'

export default function KeyStatus() {
  const qc = useQueryClient()
  const [rotated, setRotated] = useState(false)

  const { data } = useQuery({
    queryKey: ['vaultStatus'],
    queryFn: getVaultStatus,
    refetchInterval: 5000,
  })

  const { data: convergent } = useQuery({
    queryKey: ['convergent'],
    queryFn: getConvergent,
    refetchInterval: 5000,
  })

  const rotateMutation = useMutation({
    mutationFn: rotateKey,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vaultStatus'] })
      setRotated(true)
      setTimeout(() => setRotated(false), 3000)
    },
  })

  const convergentMutation = useMutation({
    mutationFn: (enabled: boolean) => setConvergent(enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['convergent'] }),
  })

  const key = data?.key
  const convergentOn = convergent?.enabled ?? false

  return (
    <div className="card">
      <div className="card-header">
        <Lock className="w-4 h-4 text-purple-400" />
        <span className="label text-purple-400">Transit Encryption Key</span>
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex justify-between items-center">
          <span className="label">Key Name</span>
          <span className="font-mono text-xs text-slate-300">{key?.name ?? '—'}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="label">Algorithm</span>
          <span className="font-mono text-xs text-slate-300">{key?.type ?? '—'}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="label">Current Version</span>
          <AnimatePresence mode="wait">
            <motion.span
              key={key?.latest_version}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="font-mono text-sm font-bold text-purple-400"
            >
              v{key?.latest_version ?? 1}
            </motion.span>
          </AnimatePresence>
        </div>
        <div className="flex justify-between items-center">
          <span className="label">Min Decrypt Ver.</span>
          <span className="font-mono text-xs text-slate-400">v{key?.min_decryption_version ?? 1}</span>
        </div>
      </div>

      <p className="text-[10px] text-slate-600 mb-3 leading-relaxed">
        Rotating bumps the key version. Old ciphertext decrypts with previous versions; new encrypts use the latest.
      </p>

      <button
        onClick={() => rotateMutation.mutate()}
        disabled={rotateMutation.isPending}
        className="btn-ghost w-full justify-center mb-4"
      >
        <AnimatePresence mode="wait">
          {rotated ? (
            <motion.span
              key="done"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-green-400"
            >
              <CheckCircle2 className="w-4 h-4" />
              Key Rotated!
            </motion.span>
          ) : (
            <motion.span
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <RotateCw className={`w-4 h-4 ${rotateMutation.isPending ? 'animate-spin' : ''}`} />
              Rotate Key
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* Convergent encryption toggle */}
      <div className={clsx(
        'p-3 rounded-lg border transition-colors',
        convergentOn
          ? 'bg-amber-950/30 border-amber-800/40'
          : 'bg-slate-800/40 border-slate-700/40',
      )}>
        <div className="flex items-center justify-between mb-1.5">
          <span className={clsx('text-xs font-semibold', convergentOn ? 'text-amber-300' : 'text-slate-400')}>
            Convergent Encryption
          </span>
          <button
            onClick={() => convergentMutation.mutate(!convergentOn)}
            disabled={convergentMutation.isPending}
            className={clsx(
              'relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0',
              convergentOn ? 'bg-amber-500' : 'bg-slate-600',
            )}
            aria-label="Toggle convergent encryption"
          >
            <motion.span
              layout
              className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow"
              animate={{ left: convergentOn ? '17px' : '2px' }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </button>
        </div>
        <p className="text-[10px] leading-relaxed text-slate-500">
          {convergentOn
            ? 'On — identical plaintext produces identical ciphertext. Submit two claims with the same SSN and peek raw DB to confirm.'
            : 'Off — each encryption produces a unique ciphertext even for identical plaintext.'}
        </p>
      </div>
    </div>
  )
}

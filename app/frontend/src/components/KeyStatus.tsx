import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { RotateCw, Lock, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { getVaultStatus, rotateKey } from '../api'

export default function KeyStatus() {
  const qc = useQueryClient()
  const [rotated, setRotated] = useState(false)

  const { data } = useQuery({
    queryKey: ['vaultStatus'],
    queryFn: getVaultStatus,
    refetchInterval: 5000,
  })

  const mutation = useMutation({
    mutationFn: rotateKey,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vaultStatus'] })
      setRotated(true)
      setTimeout(() => setRotated(false), 3000)
    },
  })

  const key = data?.key

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
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="btn-ghost w-full justify-center"
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
              <RotateCw className={`w-4 h-4 ${mutation.isPending ? 'animate-spin' : ''}`} />
              Rotate Key
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </div>
  )
}

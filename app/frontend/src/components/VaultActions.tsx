import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Zap, AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { revokeLeases } from '../api'

export default function VaultActions() {
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: revokeLeases,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vaultStatus'] })
      setConfirm(false)
      setError(null)
    },
    onError: (err: Error) => {
      setConfirm(false)
      setError(err.message)
    },
  })

  return (
    <div className="card">
      <div className="card-header">
        <Zap className="w-4 h-4 text-amber-400" />
        <span className="label text-amber-400">Live Demo Actions</span>
      </div>

      <div className="space-y-2">
        <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
          <p className="text-xs text-slate-400 mb-1 font-medium">Revoke All DB Leases</p>
          <p className="text-[10px] text-slate-600 mb-3 leading-relaxed">
            Forces Vault to immediately revoke every active database credential. The app
            auto-requests a new one and reconnects — zero downtime.
          </p>

          {error && (
            <p className="text-[10px] text-red-400 mb-2 font-mono break-all">{error}</p>
          )}

          {!confirm ? (
            <button
              onClick={() => { setError(null); setConfirm(true) }}
              className="btn-danger w-full justify-center text-xs"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Revoke All Leases
            </button>
          ) : (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-2"
            >
              <p className="text-xs text-red-400 text-center font-medium">Are you sure?</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setConfirm(false)}
                  className="btn-ghost text-xs justify-center"
                >
                  Cancel
                </button>
                <button
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending}
                  className="btn-danger text-xs justify-center"
                >
                  {mutation.isPending ? 'Revoking…' : 'Confirm'}
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}

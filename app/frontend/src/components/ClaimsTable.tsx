import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, EyeOff, Database, ShieldAlert, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { getClaims, getClaimsRaw, deleteClaim } from '../api'
import type { Claim, ClaimRaw } from '../types'

const TYPE_STYLES: Record<string, string> = {
  auto:      'bg-blue-900/40 text-blue-300 border-blue-800/40',
  home:      'bg-emerald-900/40 text-emerald-300 border-emerald-800/40',
  health:    'bg-rose-900/40 text-rose-300 border-rose-800/40',
  life:      'bg-violet-900/40 text-violet-300 border-violet-800/40',
  specialty: 'bg-amber-900/40 text-amber-300 border-amber-800/40',
}

const TYPE_ICONS: Record<string, string> = {
  auto: '🚗', home: '🏠', health: '🏥', life: '💙', specialty: '⭐',
}

function DeleteButton({ id, onDelete }: { id: number; onDelete: (id: number) => void }) {
  return (
    <button
      onClick={() => onDelete(id)}
      className="text-slate-600 hover:text-red-400 transition-colors"
      title="Delete claim"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  )
}

function DecryptedTable({ claims, onDelete }: { claims: Claim[]; onDelete: (id: number) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800">
            {['Name', 'SSN', 'DOB', 'Amount', 'Type', 'Description', ''].map(h => (
              <th key={h} className="text-left py-2 px-3 label">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <AnimatePresence>
            {claims.map(c => (
              <motion.tr
                key={c.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
              >
                <td className="py-2.5 px-3 font-medium text-slate-200 whitespace-nowrap">{c.name}</td>
                <td className="py-2.5 px-3 font-mono text-green-400 whitespace-nowrap">{c.ssn}</td>
                <td className="py-2.5 px-3 font-mono text-slate-400 whitespace-nowrap">{c.date_of_birth}</td>
                <td className="py-2.5 px-3 font-mono text-slate-200 whitespace-nowrap">
                  ${c.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="py-2.5 px-3">
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full border font-medium', TYPE_STYLES[c.claim_type] ?? 'bg-slate-800 text-slate-300')}>
                    {TYPE_ICONS[c.claim_type]} {c.claim_type}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-slate-400 max-w-xs truncate">{c.description}</td>
                <td className="py-2.5 px-3">
                  <DeleteButton id={c.id} onDelete={onDelete} />
                </td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  )
}

function RawTable({ claims, onDelete }: { claims: ClaimRaw[]; onDelete: (id: number) => void }) {
  return (
    <div className="overflow-x-auto">
      <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-amber-950/30 border border-amber-900/30">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
        <p className="text-xs text-amber-300/80">
          This is what an attacker sees if the database is compromised. Vault never wrote plaintext.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800">
            {['Name', 'SSN (encrypted)', 'DOB (encrypted)', 'Amount (encrypted)', 'Type', ''].map(h => (
              <th key={h} className="text-left py-2 px-3 label">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <AnimatePresence>
            {claims.map(c => (
              <motion.tr
                key={c.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="border-b border-slate-800/50"
              >
                <td className="py-2.5 px-3 font-medium text-slate-200 whitespace-nowrap">{c.name}</td>
                <td className="py-2.5 px-3 max-w-[180px]">
                  <p className="cipher truncate" title={c.ssn_encrypted}>{c.ssn_encrypted}</p>
                </td>
                <td className="py-2.5 px-3 max-w-[180px]">
                  <p className="cipher truncate" title={c.dob_encrypted}>{c.dob_encrypted}</p>
                </td>
                <td className="py-2.5 px-3 max-w-[180px]">
                  <p className="cipher truncate" title={c.amount_encrypted}>{c.amount_encrypted}</p>
                </td>
                <td className="py-2.5 px-3">
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full border font-medium', TYPE_STYLES[c.claim_type] ?? 'bg-slate-800 text-slate-300')}>
                    {TYPE_ICONS[c.claim_type]} {c.claim_type}
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  <DeleteButton id={c.id} onDelete={onDelete} />
                </td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  )
}

interface Props {
  rawMode: boolean
  onToggle: () => void
}

export default function ClaimsTable({ rawMode, onToggle }: Props) {
  const qc = useQueryClient()
  const decrypted = useQuery({ queryKey: ['claims'], queryFn: getClaims, refetchInterval: 8000 })
  const raw = useQuery({ queryKey: ['claimsRaw'], queryFn: getClaimsRaw, refetchInterval: 8000 })

  const { mutate: handleDelete } = useMutation({
    mutationFn: deleteClaim,
    onSuccess: (_, id) => {
      qc.setQueryData<Claim[]>(['claims'], old => old?.filter(c => c.id !== id) ?? [])
      qc.setQueryData<ClaimRaw[]>(['claimsRaw'], old => old?.filter(c => c.id !== id) ?? [])
      qc.invalidateQueries({ queryKey: ['claims'] })
      qc.invalidateQueries({ queryKey: ['claimsRaw'] })
    },
    onError: (err: Error) => {
      // eslint-disable-next-line no-alert
      alert(`Delete failed: ${err.message}`)
    },
  })

  const isLoading = rawMode ? raw.isLoading : decrypted.isLoading
  const count = rawMode ? raw.data?.length : decrypted.data?.length

  return (
    <div className="card flex flex-col min-h-0">
      <div className="card-header">
        <Database className="w-4 h-4 text-slate-400" />
        <span className="label">Claims Database</span>
        {count != null && (
          <span className="text-xs text-slate-500">{count} records</span>
        )}
        <button
          onClick={onToggle}
          className={clsx(
            'ml-auto btn text-xs py-1 px-3 gap-1.5 transition-all',
            rawMode
              ? 'bg-amber-900/30 border border-amber-700/40 text-amber-300 hover:bg-amber-800/40'
              : 'bg-vault-900/30 border border-vault-700/40 text-vault-300 hover:bg-vault-800/40',
          )}
        >
          {rawMode ? (
            <><EyeOff className="w-3.5 h-3.5" /> Show Decrypted</>
          ) : (
            <><Eye className="w-3.5 h-3.5" /> Peek Raw DB</>
          )}
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-8 bg-slate-800 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={rawMode ? 'raw' : 'decrypted'}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="overflow-auto"
          >
            {rawMode
              ? <RawTable claims={raw.data ?? []} onDelete={handleDelete} />
              : <DecryptedTable claims={decrypted.data ?? []} onDelete={handleDelete} />
            }
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}

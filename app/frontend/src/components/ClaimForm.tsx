import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { FilePlus, Wand2, CheckCircle2 } from 'lucide-react'
import { createClaim } from '../api'
import type { ClaimCreate, ClaimType } from '../types'

const CLAIM_TYPES: ClaimType[] = ['auto', 'home', 'health', 'life', 'specialty']

const AUTOFILL_POOL: ClaimCreate[] = [
  {
    name: 'Michael Jordan',
    ssn: '111-22-3333',
    date_of_birth: '1963-02-17',
    amount: 1_800_000,
    claim_type: 'health',
    description: 'Knee cartilage repair — bilateral, post-retirement athletic training',
  },
  {
    name: 'Dolly Parton',
    ssn: '222-33-4444',
    date_of_birth: '1946-01-19',
    amount: 250_000,
    claim_type: 'specialty',
    description: 'Wigs and stage costume collection — total loss in tour bus fire',
  },
  {
    name: 'Tim McGraw',
    ssn: '333-44-5555',
    date_of_birth: '1967-05-01',
    amount: 92_000,
    claim_type: 'auto',
    description: 'RAM 1500 totaled — deer strike on I-40 near Nashville',
  },
  {
    name: 'Shaquille O\'Neal',
    ssn: '444-55-6666',
    date_of_birth: '1972-03-06',
    amount: 3_400_000,
    claim_type: 'home',
    description: 'Fire suppression system malfunction — Orlando estate, flooding damage',
  },
  {
    name: 'Miranda Lambert',
    ssn: '555-66-7777',
    date_of_birth: '1983-11-10',
    amount: 67_000,
    claim_type: 'home',
    description: 'Barn and tractor — lightning strike, Tishomingo County property',
  },
]

const EMPTY: ClaimCreate = {
  name: '',
  ssn: '',
  date_of_birth: '',
  amount: 0,
  claim_type: 'health',
  description: '',
}

export default function ClaimForm() {
  const qc = useQueryClient()
  const [form, setForm] = useState<ClaimCreate>(EMPTY)
  const [submitted, setSubmitted] = useState(false)

  const mutation = useMutation({
    mutationFn: createClaim,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['claims'] })
      qc.invalidateQueries({ queryKey: ['claimsRaw'] })
      setForm(EMPTY)
      setSubmitted(true)
      setTimeout(() => setSubmitted(false), 2500)
    },
  })

  const autofill = () => {
    const pick = AUTOFILL_POOL[Math.floor(Math.random() * AUTOFILL_POOL.length)]
    setForm(pick)
  }

  const set = (k: keyof ClaimCreate) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: k === 'amount' ? Number(e.target.value) : e.target.value }))

  const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-vault-600 focus:ring-1 focus:ring-vault-600/50 transition-colors'

  return (
    <div className="card">
      <div className="card-header">
        <FilePlus className="w-4 h-4 text-vault-400" />
        <span className="label text-vault-400">Submit Claim</span>
        <button onClick={autofill} className="ml-auto btn-ghost text-xs py-1 px-2">
          <Wand2 className="w-3 h-3" />
          Auto-fill
        </button>
      </div>

      <form
        onSubmit={e => { e.preventDefault(); mutation.mutate(form) }}
        className="space-y-3"
      >
        <div>
          <label className="label block mb-1">Claimant Name</label>
          <input className={inputCls} value={form.name} onChange={set('name')} placeholder="Full name" required />
        </div>

        <div>
          <label className="label block mb-1">SSN <span className="text-vault-500">(encrypted by Vault)</span></label>
          <input className={inputCls} value={form.ssn} onChange={set('ssn')} placeholder="123-45-6789" pattern="\d{3}-\d{2}-\d{4}" required />
        </div>

        <div>
          <label className="label block mb-1">Date of Birth <span className="text-vault-500">(encrypted)</span></label>
          <input className={inputCls} type="date" value={form.date_of_birth} onChange={set('date_of_birth')} required />
        </div>

        <div>
          <label className="label block mb-1">Claim Amount ($)</label>
          <input className={inputCls} type="number" value={form.amount || ''} onChange={set('amount')} placeholder="0.00" min={1} step="0.01" required />
        </div>

        <div>
          <label className="label block mb-1">Claim Type</label>
          <select className={inputCls} value={form.claim_type} onChange={set('claim_type')}>
            {CLAIM_TYPES.map(t => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label block mb-1">Description</label>
          <textarea className={`${inputCls} resize-none`} rows={3} value={form.description} onChange={set('description')} placeholder="Describe the claim…" required />
        </div>

        <button type="submit" disabled={mutation.isPending} className="btn-primary w-full justify-center">
          <AnimatePresence mode="wait">
            {submitted ? (
              <motion.span key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-green-300">
                <CheckCircle2 className="w-4 h-4" /> Claim Submitted
              </motion.span>
            ) : (
              <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {mutation.isPending ? 'Encrypting & Storing…' : 'Submit Claim'}
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {mutation.isError && (
          <p className="text-xs text-red-400">{(mutation.error as Error).message}</p>
        )}
      </form>
    </div>
  )
}

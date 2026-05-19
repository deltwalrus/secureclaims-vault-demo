import { useState } from 'react'
import Header from './components/Header'
import ClaimForm from './components/ClaimForm'
import ClaimsTable from './components/ClaimsTable'
import CredentialPanel from './components/CredentialPanel'
import KeyStatus from './components/KeyStatus'
import VaultActions from './components/VaultActions'
import AuditLog from './components/AuditLog'

export default function App() {
  const [rawMode, setRawMode] = useState(false)

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Header />

      <main className="flex-1 p-5 grid grid-cols-12 gap-5 items-start">
        {/* Left column: form + actions */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-5">
          <ClaimForm />
          <VaultActions />
        </div>

        {/* Center column: claims table */}
        <div className="col-span-12 lg:col-span-6">
          <ClaimsTable rawMode={rawMode} onToggle={() => setRawMode(r => !r)} />
        </div>

        {/* Right column: vault status */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-5">
          <CredentialPanel />
          <KeyStatus />
        </div>
      </main>

      {/* Full-width audit log */}
      <div className="px-5 pb-5">
        <AuditLog />
      </div>
    </div>
  )
}

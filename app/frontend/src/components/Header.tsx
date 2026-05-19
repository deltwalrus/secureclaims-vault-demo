import { HashiCorpMark, VaultMark } from './Logos'

export default function Header() {
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
      <div className="px-6 py-3 flex items-center justify-between">

        {/* Left: HashiCorp mark + app title */}
        <div className="flex items-center gap-3">
          <HashiCorpMark className="w-8 h-8 text-white" />
          <div>
            <h1 className="text-base font-semibold tracking-tight text-white">SecureClaims</h1>
            <p className="text-xs text-slate-500">HashiCorp Vault Demo</p>
          </div>
        </div>

        {/* Right: Vault connected status + engine pills */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60">
            <VaultMark className="w-5 h-6" />
            <span className="text-xs font-semibold tracking-wide text-white">HashiCorp Vault</span>
            <span className="w-px h-3.5 bg-slate-600" />
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400">Connected</span>
          </div>

          <span className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-xs">
            Transit · Database · KV v2
          </span>
        </div>

      </div>
    </header>
  )
}

import type { Claim, ClaimCreate, ClaimRaw, VaultStatus } from './types'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(text)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const getClaims = () => apiFetch<Claim[]>('/api/claims')
export const getClaimsRaw = () => apiFetch<ClaimRaw[]>('/api/claims/raw')
export const getVaultStatus = () => apiFetch<VaultStatus>('/api/vault/status')

export const createClaim = (data: ClaimCreate) =>
  apiFetch<Claim>('/api/claims', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const rotateKey = () =>
  apiFetch<{ message: string; key: VaultStatus['key'] }>('/api/vault/rotate-key', { method: 'POST' })

export const revokeLeases = () =>
  apiFetch<{ message: string }>('/api/vault/revoke-leases', { method: 'POST' })

export const deleteClaim = (id: number) =>
  apiFetch<void>(`/api/claims/${id}`, { method: 'DELETE' })

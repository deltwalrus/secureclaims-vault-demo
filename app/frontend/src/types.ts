export interface Claim {
  id: number
  name: string
  ssn: string
  date_of_birth: string
  amount: number
  claim_type: string
  description: string
  status: string
  created_at: string
}

export interface ClaimRaw {
  id: number
  name: string
  ssn_encrypted: string
  dob_encrypted: string
  amount_encrypted: string
  claim_type: string
  description: string
  status: string
  created_at: string
}

export interface ClaimCreate {
  name: string
  ssn: string
  date_of_birth: string
  amount: number
  claim_type: string
  description: string
}

export interface CredentialInfo {
  username: string
  lease_id: string
  ttl: number
  obtained_at: number
  expires_at: number
}

export interface KeyInfo {
  name: string
  type: string
  latest_version: number
  min_decryption_version: number
}

export interface VaultStatus {
  credential: CredentialInfo
  key: KeyInfo
  vault_addr: string
}

export interface AuditEvent {
  timestamp: string
  operation: string
  path: string
  status: string
  extra: Record<string, unknown>
}

export type ClaimType = 'auto' | 'home' | 'health' | 'life' | 'specialty'

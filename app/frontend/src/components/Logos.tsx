// Official HashiCorp and Vault SVG logo marks.
// Paths extracted from @hashicorp/web-mktg-logos npm package.

interface LogoProps {
  className?: string
}

// HashiCorp logo mark — three-path isometric "H" shape, white on dark
export function HashiCorpMark({ className = 'w-6 h-6' }: LogoProps) {
  return (
    <svg className={className} viewBox="0 0 50 53" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="HashiCorp">
      <path d="M20.7903 0.0100098L0.0703125 11.97V11.98V40.68L7.85031 45.18V16.46L20.7903 8.99001V0.0100098Z" fill="currentColor"/>
      <path d="M29.06 0.0100098V22.88H20.79V14.34L13 18.84V48.14L20.79 52.64V29.84H29.06V38.32L36.85 33.83V4.51001L29.06 0.0100098Z" fill="currentColor"/>
      <path d="M29.0605 52.65L49.7805 40.7V40.69V11.99L42.0005 7.48999V36.2L29.0605 43.67V52.65Z" fill="currentColor"/>
    </svg>
  )
}

// Vault logo mark — downward triangle with internal grid, Vault yellow (#ffcf25)
export function VaultMark({ className = 'w-6 h-6' }: LogoProps) {
  return (
    <svg className={className} viewBox="0 0 53.2 72" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Vault">
      <path
        d="m0,10.2l26.5,51.6L53.2,10.2H0Zm22.4,20.5h-4.2v-4.2h4.2v4.2Zm0-6.3h-4.2v-4.2h4.2v4.2Zm6.3,12.6h-4.2v-4.2h4.2v4.2Zm0-6.3h-4.2v-4.2h4.2v4.2Zm0-6.3h-4.2v-4.2h4.2v4.2Zm6.3,6.3h-4.2v-4.2h4.2v4.2Zm-4.2-6.3v-4.2h4.2v4.2h-4.2Z"
        fill="#ffcf25"
      />
    </svg>
  )
}

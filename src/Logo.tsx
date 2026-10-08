export function Logo() {
  return <svg viewBox="0 0 430 92" role="img" aria-label="1UPX Virtual Sports" style={{ width: '100%', maxWidth: 220, height: 'auto' }}>
    <defs><filter id="upx-glow" x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <path d="M10 22 32 5h42L61 22H47L35 77H10l10-45H0z" fill="#fff" filter="url(#upx-glow)"/>
    <path d="m12 22 22-17-9 31H5z" fill="#b6ff00"/>
    <path d="M84 5h29L99 54q-3 10 7 10 9 0 12-10l14-49h29l-15 54q-10 34-47 34-38 0-29-34z" fill="#fff"/>
    <path d="M168 5h53q32 0 24 29-7 25-39 25h-22l-5 18h-29zm22 20-4 14h20q11 0 14-7 2-7-9-7z" fill="#fff"/>
    <path d="m252 5 30 32-42 40h37l25-25 18 25h38l-31-40 41-32h-37l-24 24-18-24z" fill="#fff"/>
    <path d="M5 88h362" stroke="#b6ff00" strokeWidth="2" opacity=".9"/>
    <text x="292" y="84" fill="#b6ff00" fontFamily="Arial, sans-serif" fontSize="10" fontWeight="700" letterSpacing="2">VIRTUAL SPORTS</text>
  </svg>;
}

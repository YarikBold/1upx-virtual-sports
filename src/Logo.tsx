export function Logo() {
  return <svg viewBox="0 0 320 64" role="img" aria-label="1UPX Virtual Sports" style={{ width: '100%', maxWidth: 205, height: 'auto' }}>
    <defs><linearGradient id="upx-lime" x1="0" x2="1"><stop stopColor="#b6ff00"/><stop offset="1" stopColor="#e0ff78"/></linearGradient></defs>
    <rect x="2" y="2" width="60" height="60" rx="16" fill="#111511" stroke="#b6ff00" strokeWidth="2"/>
    <path d="M15 17v18c0 9 5 14 14 14 8 0 13-5 13-14V17H31v17c0 3-1 5-3 5s-3-2-3-5V17z" fill="url(#upx-lime)"/>
    <path d="M46 17h10L42 48H32z" fill="#fff" opacity=".9"/>
    <path d="M79 17h17c10 0 16 5 16 13s-6 13-16 13h-6v9H79zm11 9v11h5c4 0 6-2 6-5.5S99 26 95 26zM117 17h11v35h-11zM137 17h12l8 11 8-11h13l-15 17 16 18h-13l-9-12-9 12h-13l16-18z" fill="#fff"/>
    <path d="M79 57h99" stroke="#b6ff00" strokeWidth="2"/><text x="190" y="40" fill="#b6ff00" fontFamily="Arial, sans-serif" fontSize="13" fontWeight="700" letterSpacing="3">VIRTUAL SPORTS</text>
  </svg>;
}

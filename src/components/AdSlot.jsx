import { useEffect, useRef, useState } from 'react'

// Bloco manual do Google AdSense. Só existe em produção, com o bloco configurado
// (VITE_ADSENSE_SLOT_*), e em telas largas. O script do Google só é baixado quando o
// primeiro bloco chega perto da área visível; se o anúncio não vier (bloqueador, sem
// anunciante), o espaço some. O mesmo publisher está em public/ads.txt.
const CLIENT = 'ca-pub-3869077252152337'
const WIDE = '(min-width: 900px)'

let script
function loadScript() {
  script ??= new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.async = true
    el.crossOrigin = 'anonymous'
    el.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`
    el.onload = resolve
    el.onerror = reject
    document.head.appendChild(el)
  })
  return script
}

export default function AdSlot({ slot, className = '' }) {
  const enabled = !import.meta.env.DEV && CLIENT && slot && window.matchMedia(WIDE).matches
  const ref = useRef(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!enabled || !ref.current) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        io.disconnect()
        loadScript()
          .then(() => (window.adsbygoogle ||= []).push({}))
          .catch(() => setFailed(true))
      },
      { rootMargin: '200px' },
    )
    io.observe(ref.current)
    return () => io.disconnect()
  }, [enabled])

  if (!enabled || failed) return null
  return (
    <aside ref={ref} className={`ad-slot ${className}`} aria-label="Publicidade">
      <span className="ad-label">Publicidade</span>
      <ins
        className="adsbygoogle"
        data-ad-client={CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="false"
      />
    </aside>
  )
}

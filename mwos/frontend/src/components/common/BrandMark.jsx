import React from 'react'
import logo from '../../assets/tmc-copino-logo.png'

export default function BrandMark({ compact = false, label = 'TMC Copino', sublabel = 'Birthing home & medical clinic' }) {
  return (
    <div className={`brand-mark ${compact ? 'brand-mark-compact' : ''}`}>
      <div className="brand-mark-shell">
        <div className="brand-mark-glow" />
        <img src={logo} alt="TMC Copino logo" className="brand-mark-image" />
      </div>
      <div className="brand-mark-copy">
        <p className="brand-mark-label">{label}</p>
        <p className="brand-mark-sublabel">{sublabel}</p>
      </div>
    </div>
  )
}

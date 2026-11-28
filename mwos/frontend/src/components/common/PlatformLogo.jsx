import React from 'react'

// Decorative marks: the adjacent platform name provides the accessible label.
export default function PlatformLogo({ platform, className = '' }) {
  return (
    <svg className={className} width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      {platform === 'windows' ? <path fill="#0078d4" d="M2 3h9v8H2zm11 0h9v8h-9zM2 13h9v8H2zm11 0h9v8h-9z" /> : null}
      {platform === 'android' ? <g fill="#3d8b46"><path d="m7 6-1.2-2 .8-.5 1.3 2.1a8.8 8.8 0 0 1 8.2 0l1.3-2.1.8.5L17 6c2 1.4 3.3 3.6 3.5 6h-17C3.7 9.6 5 7.4 7 6ZM5 13h14v5a2 2 0 0 1-2 2h-1v2h-2v-2h-4v2H8v-2H7a2 2 0 0 1-2-2Z" /><circle cx="8" cy="9" r="1" fill="white" /><circle cx="16" cy="9" r="1" fill="white" /></g> : null}
    </svg>
  )
}

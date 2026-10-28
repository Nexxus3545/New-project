import React from 'react'

// Decorative marks: the adjacent platform name provides the accessible label.
export default function PlatformLogo({ platform, className = '' }) {
  const apple = <path d="M17.1 12.4c0-2 1.6-3 1.7-3.1-1-1.5-2.5-1.7-3-1.7-1.3-.1-2.5.8-3.2.8-.6 0-1.6-.8-2.7-.8-1.4 0-2.7.8-3.4 2-1.5 2.5-.4 6.3 1 8.3.7 1 1.5 2.1 2.6 2 1-.1 1.5-.7 2.8-.7 1.3 0 1.7.7 2.8.7 1.2 0 1.9-1 2.5-2 .8-1.1 1.1-2.2 1.1-2.3-.1 0-2.2-.9-2.2-3.2ZM15 6.2c.6-.8 1.1-1.9 1-3-.9 0-2 .6-2.7 1.4-.6.7-1.2 1.8-1 2.8 1 .1 2.1-.5 2.7-1.2Z" />
  return (
    <svg className={className} width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      {platform === 'windows' ? <path fill="#0078d4" d="M2 3h9v8H2zm11 0h9v8h-9zM2 13h9v8H2zm11 0h9v8h-9z" /> : null}
      {platform === 'android' ? <g fill="#3d8b46"><path d="m7 6-1.2-2 .8-.5 1.3 2.1a8.8 8.8 0 0 1 8.2 0l1.3-2.1.8.5L17 6c2 1.4 3.3 3.6 3.5 6h-17C3.7 9.6 5 7.4 7 6ZM5 13h14v5a2 2 0 0 1-2 2h-1v2h-2v-2h-4v2H8v-2H7a2 2 0 0 1-2-2Z" /><circle cx="8" cy="9" r="1" fill="white" /><circle cx="16" cy="9" r="1" fill="white" /></g> : null}
      {platform === 'macos' || platform === 'ios' ? apple : null}
    </svg>
  )
}

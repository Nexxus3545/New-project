import React from 'react'

const artwork = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  patients: <><path d="M14 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M17 14a4 4 0 0 1 4 4v3M16 3a4 4 0 0 1 0 8" /><circle cx="8.5" cy="7" r="4" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18m-13 5 2 2 5-5" /></>,
  prenatal: <><path d="M9 10c-1.7 1-3 3.2-3 5.5V21m5-13 2 4c3 .4 5 2.3 5 4.5 0 2.5-2 4.5-4.5 4.5H10m-1-7 3 2h4" /><circle cx="10" cy="4" r="2" /></>,
  postnatal: <><path d="M12 21 3.9 13.2a5.4 5.4 0 0 1 7.6-7.6L12 6l.5-.4a5.4 5.4 0 0 1 7.6 7.6Z" /><path d="M7 12h3l1.5-3 2 6 1.5-3h2" /></>,
  baby: <><circle cx="12" cy="13" r="8" /><path d="M12 5c-3-3 2-4 2-2 0 1-1 2-2 2M8.5 11h.01M15.5 11h.01M9 16a4 4 0 0 0 6 0" /></>,
  delivery: <><path d="M3 21V5m0 12h18v4M3 10h4a3 3 0 0 1 3 3v4m0-6h7a4 4 0 0 1 4 4v2" /><circle cx="6.5" cy="7" r="1.5" /><path d="M15 3v5m-2.5-2.5h5" /></>,
  records: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Zm0 0v6h6M8 17h8M8 13h5" /></>,
  video: <><rect x="3" y="5" width="13" height="14" rx="2" /><path d="m16 10 5-3v10l-5-3M7 12h5m-2.5-2.5v5" /></>,
  messages: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8A8.5 8.5 0 0 1 12.5 20a8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8Z" /><path d="M8 9h8M8 13h5" /></>,
  emergency: <><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" /><path d="M12 6v7m-3.5-3.5h7" /></>,
  inventory: <><path d="m12 3 9 5-9 5-9-5Zm-9 5v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5" /></>,
  education: <><path d="M12 5C9 3 6 3 3 4v15c3-1 6-1 9 1m0-15c3-2 6-2 9-1v15c-3-1-6-1-9 1Zm-5 3h2M7 12h2m6-4h2m-2 4h2" /></>,
  reports: <><path d="M4 3v17h17M8 16v-5m5 5V7m5 9v-7" /></>,
  settings: <><path d="m9.5 3-.6 2.2-1.5.9-2.2-.6-2.5 4.3 1.6 1.6v1.7l-1.6 1.6 2.5 4.3 2.2-.6 1.5.9.6 2.2h5l.6-2.2 1.5-.9 2.2.6 2.5-4.3-1.6-1.6v-1.7l1.6-1.6-2.5-4.3-2.2.6-1.5-.9-.6-2.2Z" /><circle cx="12" cy="12" r="3" /></>,
  users: <><circle cx="9" cy="7" r="4" /><path d="M3 21v-2a6 6 0 0 1 11-3m4-1v6m-3-3h6" /></>,
  credentials: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8" cy="10" r="2" /><path d="M5 16a3 3 0 0 1 6 0m3-7h4m-4 4 1.5 1.5L18 12" /></>,
  compliance: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" /><path d="m8 12 3 3 5-6" /></>,
  notifications: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
  health: <><path d="m12 21-8.1-7.8a5.4 5.4 0 0 1 7.6-7.6L12 6l.5-.4a5.4 5.4 0 0 1 7.6 7.6Z" /><path d="M12 9v6m-3-3h6" /></>,
  profile: <><circle cx="12" cy="7" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
  appearance: <><path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.4-3.4 1.5 1.5 0 0 1 1.1-2.6H18a3 3 0 0 0 3-3 9 9 0 0 0-9-9Z" /><circle cx="7.5" cy="10" r=".7" /><circle cx="10" cy="6.5" r=".7" /><circle cx="14.5" cy="6.5" r=".7" /><circle cx="17" cy="10" r=".7" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  signOut: <><path d="M9 4H4v16h5m6-12 4 4-4 4m-7-4h11" /></>,
}

export default function AppIcon({ name, className = 'h-5 w-5' }) {
  return (
    <svg className={`shrink-0 ${className}`} viewBox="0 0 24 24" width="24" height="24"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" data-app-icon={name}>
      {artwork[name] || artwork.dashboard}
    </svg>
  )
}

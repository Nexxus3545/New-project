// The server authorizes participants and provisions a private room on explicit join.
export const canJoinTelehealth = (session) => Boolean(session?.id) && ['scheduled', 'active'].includes(session?.status)

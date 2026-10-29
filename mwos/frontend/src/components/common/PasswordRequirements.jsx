import React from 'react'
import { passwordPolicyChecks } from '../../utils/passwordPolicy'

const rules = [
  ['length', 'At least 8 characters'], ['letter', 'A letter'], ['number', 'A number'],
  ['symbol', 'A symbol, such as !, @, or #'], ['supported', 'Within the supported password length'],
]

export default function PasswordRequirements({ password = '', id }) {
  const checks = passwordPolicyChecks(password)
  const passed = Object.values(checks).every(Boolean)
  return <div id={id} className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
    <p className="font-semibold" role="status">{passed ? 'Password meets the requirements.' : 'Your new password needs:'}</p>
    <ul className="mt-1 grid gap-1 sm:grid-cols-2" aria-label="Password requirements">{rules.map(([key, label]) => <li key={key} className={password && checks[key] ? 'text-emerald-700 dark:text-emerald-300' : ''}><span aria-hidden="true">{password && checks[key] ? '✓' : '○'} </span>{label}<span className="sr-only">{password && checks[key] ? ': met' : ': required'}</span></li>)}</ul>
    <p className="mt-1">Spaces do not count as symbols.</p>
  </div>
}

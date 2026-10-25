import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../utils/api'
import { settingsSections, useSettingsStore } from '../../store/settingsStore'
import { SignInReview } from './AccountSecurityActions'

export default function SettingsPanel({ section, account }) {
  const { preferences, update } = useSettingsStore()
  const [notice, setNotice] = useState('')
  const fil = preferences.language === 'fil'
  const t = (en, translated) => fil ? translated : en
  const activity = useQuery({ queryKey: ['own-account-activity', account?.id], queryFn: () => api.get('/account/activity').then((response) => response.data.data), enabled: section === 'activity' })
  const email = useQuery({ queryKey: ['email-notification-settings'], queryFn: () => api.get('/notifications/settings').then((response) => response.data.data), enabled: section === 'privacy-checkup' })
  const title = settingsSections.find((item) => item.id === section)
  const base = account?.role === 'patient' ? '/my' : ''
  const save = (patch) => {
    try { update(patch); setNotice(t('Saved on this browser.', 'Nai-save sa browser na ito.')) }
    catch { setNotice(t('Could not save. Browser storage may be blocked.', 'Hindi na-save. Maaaring naka-block ang storage ng browser.')) }
  }
  return <section className="card space-y-5" aria-label={title?.en}>
    <h2 className="section-title">{title?.[preferences.language]}</h2>
    {section === 'language' ? <>
      <p className="text-sm text-slate-600 dark:text-slate-300">{t('Choose the language of Settings navigation and these preference panels on this browser. Clinical records and other screens keep their original language.', 'Piliin ang wika ng Settings menu at mga preference panel sa browser na ito. Hindi isinasalin ang clinical records at iba pang screen.')}</p>
      <div role="group" aria-label="Settings language" className="flex flex-wrap gap-3">
        {[['en', 'English'], ['fil', 'Filipino']].map(([value, label]) => <button key={value} type="button" className={preferences.language === value ? 'btn-primary' : 'btn-secondary'} aria-pressed={preferences.language === value} onClick={() => save({ language: value })}>{label}</button>)}
      </div>
    </> : null}
    {section === 'privacy-checkup' ? <>
      <p className="text-sm text-slate-600 dark:text-slate-300">{t('Review individual controls. This is not a security certification or a guarantee that an account is safe.', 'Suriin ang bawat control. Hindi ito sertipikasyon o garantiya ng seguridad ng account.')}</p>
      <dl className="grid gap-4 sm:grid-cols-2">
        {[
          [t('Sign-in email', 'Email sa pag-sign in'), account?.email || t('Not available', 'Hindi available')],
          [t('Contact number', 'Contact number'), account?.phone ? t('Saved; SMS ownership is not verified', 'Naka-save; hindi pa SMS-verified') : t('Not saved', 'Wala pang naka-save')],
          [t('Extra Google email code', 'Karagdagang Google email code'), email.isLoading ? t('Checking...', 'Sinusuri...') : email.isError ? t('Unable to check', 'Hindi masuri') : email.data?.googleEmailCodeRequired ? t('Required', 'Kinakailangan') : t('Not enabled', 'Hindi naka-enable')],
          [t('Device permissions', 'Mga pahintulot ng device'), t('Review location and notification access in your browser site settings.', 'Suriin ang lokasyon at notifications sa site settings ng browser.')],
        ].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><dt className="text-sm text-slate-500">{label}</dt><dd className="mt-2 break-words text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</dd></div>)}
      </dl>
      <Link className="btn-secondary" to={`${base}/settings`}>{t('Review account controls', 'Suriin ang account controls')}</Link>
    </> : null}
    {section === 'privacy' ? <>
      <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{t('MWOS uses account, contact, appointment, and care information to support clinic services. Access depends on your signed-in role. Keep your device locked and do not share passwords or verification codes.', 'Ginagamit ng MWOS ang account, contact, appointment, at care information para sa serbisyo ng klinika. Nakadepende ang access sa iyong role. I-lock ang device at huwag ibahagi ang password o verification code.')}</p>
      <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{t('The mobile app uses the phone operating system for enrolled biometrics; it does not collect fingerprint images. External video players load after you choose to open them. Media images and posters may contact their hosting service when displayed.', 'Gumagamit ang mobile app ng biometric verification ng cellphone; hindi nito kinokolekta ang larawan ng fingerprint. Binubuksan ang external video player kapag pinili mo ito. Maaaring kumonekta sa hosting service ang mga larawan at poster kapag ipinakita.')}</p>
      <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{t('For correction, a copy of your information, or an account-deletion request, contact the clinic for identity verification and review. This screen does not erase clinical records or promise deletion of records the clinic must retain.', 'Para sa pagwawasto, kopya ng impormasyon, o kahilingang burahin ang account, makipag-ugnayan sa klinika para sa identity verification at review. Hindi binubura ng screen na ito ang clinical records.')}</p>
      <div className="flex flex-wrap gap-3"><Link className="btn-secondary" to={base ? '/my/profile' : '/account'}>{t('Review my information', 'Suriin ang aking impormasyon')}</Link>{base ? <Link className="btn-secondary" to="/my/messages">{t('Contact clinic securely', 'Ligtas na makipag-ugnayan sa klinika')}</Link> : null}</div>
    </> : null}
    {section === 'activity' ? <>
      <div className="flex flex-wrap gap-3"><Link className="btn-secondary" to="/forgot-password">Recover MWOS password</Link><Link className="btn-secondary" to={`${base}/settings#change-password`}>Change MWOS password</Link><a className="btn-secondary" href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer">Google account security</a></div>
      <p className="text-sm text-slate-600 dark:text-slate-300">{t('Your latest 50 recorded clinic actions and Google sign-in notices. Not a complete device or login history. Sensitive audit payloads are never shown.', 'Ang huling 50 naitalang clinic action at Google sign-in notice mo. Hindi ito kumpletong device o login history. Hindi ipinapakita ang sensitibong audit details.')}</p>
      {activity.isLoading ? <p role="status">{t('Loading activity...', 'Kinukuha ang aktibidad...')}</p> : activity.isError ? <div role="alert" className="space-y-3"><p>{t('Activity could not be loaded. No history has been cleared.', 'Hindi makuha ang aktibidad. Walang binurang history.')}</p><button type="button" className="btn-secondary" onClick={() => activity.refetch()}>{t('Retry', 'Subukan muli')}</button></div> : !activity.data?.length ? <p>{t('No recorded activity is available yet.', 'Wala pang naitalang aktibidad.')}</p> : <ol className="divide-y divide-slate-200 dark:divide-slate-700">{activity.data.map((item) => <li key={item.id} className="py-4"><p className="text-sm font-semibold">{item.action === 'GOOGLE_SIGN_IN' ? t('Google sign-in', 'Pag-sign in sa Google') : `${item.action} · ${item.area}`}</p><time className="text-xs text-slate-500" dateTime={item.createdAt}>{Number.isFinite(Date.parse(item.createdAt)) ? new Date(item.createdAt).toLocaleString(fil ? 'fil-PH' : 'en-PH') : t('Date unavailable', 'Walang petsa')}</time></li>)}</ol>}
    </> : null}
      {section === 'activity' ? activity.data?.filter((item) => item.action === 'GOOGLE_SIGN_IN' && item.securityReviewId).map((item) => <div key={item.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><h3 className="font-semibold">Google sign-in review</h3><p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>{item.reviewedAt ? <p className="text-sm">Reviewed with an email code.</p> : <SignInReview noticeId={item.securityReviewId} onVerified={() => activity.refetch()} />}</div>) : null}
    {section === 'content' ? <>
      <p className="text-sm text-slate-600 dark:text-slate-300">{t('Control optional content on your patient dashboard on this browser. These choices do not hide appointments, care records, safety alerts, or the education library.', 'Piliin ang optional na nilalaman sa patient dashboard sa browser na ito. Hindi nito itinatago ang appointments, care records, safety alerts, o education library.')}</p>
      {[['showClinicMedia', t('Show clinic videos and community events', 'Ipakita ang clinic videos at community events')], ['showTips', t('Show health-tip previews', 'Ipakita ang mga preview ng health tips')]].map(([key, label]) => <label key={key} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><input type="checkbox" checked={preferences[key]} onChange={(event) => save({ [key]: event.target.checked })} className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]" /><span className="text-sm">{label}</span></label>)}
    </> : null}
    {notice ? <p role="status" className="text-sm text-slate-600 dark:text-slate-300">{notice}</p> : null}
  </section>
}

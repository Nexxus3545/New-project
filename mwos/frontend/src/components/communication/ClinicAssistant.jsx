import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import api from '../../utils/api'
import { useAuthStore } from '../../store/authStore'
import AppIcon from '../common/AppIcon'

export const MWOS_SUPPORT_NAME = 'MWOS Support'

const AssistantContext = createContext(null)

const quickPrompts = {
  patient: [
    'How do I book a consultation?',
    'How do I message the clinic?',
    'Where are my health records?',
  ],
  staff: [
    'How do I review consultation schedules?',
    'Where are patient medical records?',
    'How do I use secure messages?',
  ],
}

const createMessage = (sender, text, extra = {}) => ({
  id: `${sender}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  sender,
  text,
  ...extra,
})

const welcome = (patient) => createMessage('assistant', patient
  ? 'Hi. I can help you find appointments, messages, telehealth, health records, birth-plan tools, clinic updates and account settings.'
  : 'Hi. I can help you find appointment review, patient records, messages, telehealth, health education and clinic operations tools.')

const routeForCurrentPortal = (route, patient) => {
  if (typeof route !== 'string' || !/^\/(?:[a-z-]+\/)*[a-z-]+$/.test(route)) return null
  if (patient) return route.startsWith('/my/') ? route : null
  return route.startsWith('/my/') ? null : route
}

export function AssistantSession({ patient = false, children }) {
  const user = useAuthStore((state) => state.user)
  const [messages, setMessages] = useState(() => [welcome(patient)])
  const [lastTopic, setLastTopic] = useState(null)
  const ask = useMutation({
    mutationFn: ({ message, previousTopic }) => api.post('/ai/assistant', { message, previousTopic }).then((response) => response.data.data),
  })

  useEffect(() => {
    setMessages([welcome(patient)])
    setLastTopic(null)
  }, [patient, user?.id])

  const sendQuestion = async (value) => {
    const message = String(value || '').trim()
    if (!message || ask.isPending) return null

    setMessages((current) => [...current, createMessage('user', message)])
    try {
      const reply = await ask.mutateAsync({ message, previousTopic: lastTopic })
      const route = routeForCurrentPortal(reply.route, patient)
      setLastTopic(typeof reply.topic === 'string' ? reply.topic : null)
      setMessages((current) => [...current, createMessage('assistant', reply.answer, {
        route,
        label: route ? reply.label : null,
        disclaimer: reply.disclaimer,
      })])
      return reply
    } catch {
      setMessages((current) => [...current, createMessage('assistant', `${MWOS_SUPPORT_NAME} is temporarily unavailable. Please try again, or use Messages to contact the clinic.`, { failed: true })])
      return null
    }
  }

  const value = {
    patient,
    messages,
    sendQuestion,
    isSending: ask.isPending,
  }

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>
}

function useAssistant() {
  const assistant = useContext(AssistantContext)
  if (!assistant) throw new Error('ClinicAssistant must be rendered inside AssistantSession.')
  return assistant
}

function AssistantMessages() {
  const { messages, isSending } = useAssistant()
  const messagesRef = useRef(null)

  useEffect(() => {
    const list = messagesRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages, isSending])

  return <div ref={messagesRef} role="log" aria-label="Chat messages" className="max-h-[28rem] space-y-3 overflow-y-auto overscroll-contain pr-1 md:max-h-[34rem]">
    {messages.map((message) => (
      <article key={message.id} className={`rounded-2xl px-4 py-3 text-sm leading-6 ${message.sender === 'user'
        ? 'ml-8 bg-[var(--accent)] text-white'
        : message.failed
          ? 'mr-8 border border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100'
          : 'mr-8 border border-slate-100 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'}`}>
        {message.sender === 'assistant' ? <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--accent-strong)] dark:text-rose-200"><AppIcon name="assistant" className="h-4 w-4" />{MWOS_SUPPORT_NAME}</div> : null}
        <p className="break-words">{message.text}</p>
        {message.route ? <Link to={message.route} className="btn-secondary btn-sm mt-3">{message.label || 'Open in MWOS'}</Link> : null}
        {message.disclaimer ? <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{message.disclaimer}</p> : null}
      </article>
    ))}
    {isSending ? <div className="mr-8 flex items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800"><span className="loading-spinner h-4 w-4" />Looking for the right MWOS tool…</div> : null}
  </div>
}

function AssistantComposer() {
  const { patient, sendQuestion, isSending } = useAssistant()
  const [draft, setDraft] = useState('')
  const fieldId = useId()
  const prompts = patient ? quickPrompts.patient : quickPrompts.staff

  const submit = async (event) => {
    event.preventDefault()
    const currentDraft = draft
    if (!currentDraft.trim()) return
    setDraft('')
    await sendQuestion(currentDraft)
  }

  return <>
    <div className="mb-3 flex flex-wrap gap-2">
      {prompts.map((prompt) => <button key={prompt} type="button" className="rounded-full border border-rose-100 bg-rose-50 px-3 py-1.5 text-left text-xs font-medium text-[var(--accent-strong)] transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200" disabled={isSending} onClick={() => sendQuestion(prompt)}>{prompt}</button>)}
    </div>
    <form onSubmit={submit} className="flex items-end gap-2">
      <label htmlFor={fieldId} className="sr-only">Your question</label>
      <textarea id={fieldId} value={draft} maxLength={800} rows={3} disabled={isSending} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault()
          event.currentTarget.form?.requestSubmit()
        }
      }} placeholder="Ask how to use MWOS…" className="input min-h-[3rem] flex-1 resize-none" />
      <button type="submit" className="btn-primary shrink-0" disabled={isSending || !draft.trim()}>{isSending ? 'Checking…' : 'Send'}</button>
    </form>
  </>
}

export function AssistantPanel({ headingRef }) {
  return <div className="space-y-4">
    <div className="flex items-start gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-white"><AppIcon name="assistant" /></span>
      <div>
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold text-slate-900 dark:text-slate-100">{MWOS_SUPPORT_NAME}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Automated help for finding MWOS tools and services.</p>
      </div>
    </div>
    <AssistantMessages />
    <div className="border-t border-slate-100 pt-4 dark:border-slate-800"><AssistantComposer /></div>
    <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">For personal medical advice, start a conversation with the clinic or request a consultation.</p>
  </div>
}

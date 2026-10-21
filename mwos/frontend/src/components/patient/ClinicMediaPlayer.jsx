import React, { useState } from 'react'
import { getMediaSource } from '../../utils/mediaSource'

export default function ClinicMediaPlayer({ src, title, poster }) {
  const [loadedSource, setLoadedSource] = useState(null)
  const [failedSource, setFailedSource] = useState(null)
  const source = getMediaSource(src)
  if (!source) return <p className="p-5 text-sm text-slate-500">This media link is unavailable.</p>
  return (
    <div className="space-y-3">
      {source.kind === 'video' && failedSource !== source.url ? (
        <video src={source.url} poster={poster || undefined} controls playsInline preload="none"
          className="aspect-video w-full rounded-2xl bg-slate-950 object-contain" onError={() => setFailedSource(source.url)} />
      ) : source.kind === 'embed' && loadedSource === source.url ? (
        <iframe key={source.embedUrl} src={source.embedUrl} title={title || 'Clinic video'} loading="lazy"
          referrerPolicy="no-referrer" allow="fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen className="aspect-video w-full rounded-2xl border-0 bg-slate-950" />
      ) : (
        <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-2xl bg-slate-100 p-5 text-center">
          <p className="text-sm text-slate-600">{title || 'Clinic video'}</p>
          {source.kind === 'embed' ? (
            <>
              <button type="button" onClick={() => setLoadedSource(source.url)} className="btn-primary">Load {source.provider} video</button>
              <p className="text-xs text-slate-500">Loading connects to {source.provider}. Private or restricted videos may require viewing on the original page.</p>
            </>
          ) : <p className="text-sm text-slate-500">Open the original post to watch this video or event.</p>}
        </div>
      )}
      <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-block text-sm font-semibold text-[var(--accent)] underline">
        Open original video or event
      </a>
    </div>
  )
}

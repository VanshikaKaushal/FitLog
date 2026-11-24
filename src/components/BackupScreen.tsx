import { useState } from 'react'
import { Download, Share, Upload } from 'lucide-react'
import { backupFile, createBackup, downloadBackup, restoreBackup, validateBackup, type Backup } from '../data/backup'
import { db } from '../data/db'

export function BackupScreen({ lastExport, back }: { lastExport?: string; back: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Backup | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const canShare = !!file && !!navigator.canShare?.({ files: [file] })

  async function run(task: () => Promise<void>, fallback: string) {
    setBusy(true)
    setStatus('')
    setError('')
    try { await task() } catch (error) {
      setError(error instanceof Error && error.message ? error.message : fallback)
    } finally { setBusy(false) }
  }

  async function generate() {
    const next = backupFile(await createBackup(db))
    setFile(next)
    if (!navigator.canShare?.({ files: [next] })) {
      downloadBackup(next)
      setStatus('Backup generated. Check your downloads.')
    } else {
      setStatus('Backup generated. Share or download the JSON file.')
    }
  }

  return <div className="stack">
    <button className="text-button self-start" onClick={back} disabled={busy}>Back to workouts</button>
    <div><h1>Data &amp; Backup</h1><p>Your workouts are stored on this device.</p></div>
    {(status || error) && <p className={error ? 'card error' : 'card'} role={error ? 'alert' : 'status'}>{error || status}</p>}
    <section className="card stack">
      <div><h2>Export backup</h2><p>Keep a JSON copy of your workouts, exercise library, and settings.</p></div>
      <p>{lastExport ? 'Last generated · ' + new Date(lastExport).toLocaleString() : 'No backup generated yet.'}</p>
      <button className="primary self-start" disabled={busy} onClick={() => void run(generate, 'Could not generate a backup.')}>
        <Download size={18} /> Generate backup
      </button>
      {file && <div className="row wrap">
        {canShare && <button className="secondary" onClick={() => {
          void navigator.share({ files: [file], title: 'FitLog backup' }).catch(error => {
            if (error.name !== 'AbortError') setError('Sharing failed. Download the file instead.')
          })
        }}><Share size={18} /> Share file</button>}
        <button className="secondary" onClick={() => downloadBackup(file)}><Download size={18} /> Download JSON</button>
      </div>}
    </section>
    <section className="card stack">
      <div><h2>Restore backup</h2><p>Choose a FitLog backup to preview its records before replacing your local data.</p></div>
      <label className="secondary file-picker self-start"><Upload size={18} /> Choose JSON file
        <input type="file" accept=".json,application/json" disabled={busy} aria-label="Choose JSON backup"
          onChange={event => {
            const selected = event.target.files?.[0]
            event.target.value = ''
            if (!selected) return
            setPreview(null)
            setConfirmed(false)
            void run(async () => {
              let data: unknown
              try { data = JSON.parse(await selected.text()) } catch { throw new Error('This file is not valid JSON.') }
              setPreview(validateBackup(data))
            }, 'Could not open the backup.')
          }} />
      </label>
      {preview && <div className="previous stack">
        <strong>{preview.counts.workouts} workouts · {preview.counts.exercises} exercises · {preview.counts.sets} sets</strong>
        <p>Generated {new Date(preview.exportedAt).toLocaleString()}</p>
        <button className="secondary self-start" disabled={busy} onClick={() => void run(generate, 'Could not generate a backup.')}>
          Export current data first
        </button>
        <label className="check"><input type="checkbox" checked={confirmed} disabled={busy}
          onChange={event => setConfirmed(event.target.checked)} /> Replace all local workouts and exercises</label>
        <button className="primary self-start" disabled={!confirmed || busy} onClick={() => void run(async () => {
          await restoreBackup(db, preview)
          setPreview(null)
          setConfirmed(false)
          setStatus('Backup restored.')
        }, 'Could not restore the backup.')}>Restore and replace</button>
      </div>}
    </section>
  </div>
}

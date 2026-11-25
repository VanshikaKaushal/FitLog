import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from 'lucide-react'
import { db } from '../../data/db'
import { getWeightData } from '../../data/weight/store'
import type { WeightEntry } from '../../data/weight/model'
import { BackupScreen } from '../BackupScreen'
import { ProgressSummary } from './ProgressSummary'
import { WeighInEditor } from './WeighInEditor'
import { WeightImport } from './WeightImport'
import { WeightLogbook } from './WeightLogbook'
import { WeightSettings } from './WeightSettings'

const sections = ['Summary', 'Logbook', 'Settings'] as const
type Panel = { type: 'weigh-in'; entry?: WeightEntry } | { type: 'import' | 'backup' }

export function ProgressScreen({ today, lastExport, onEditing }: {
  today: string; lastExport?: string; onEditing: (editing: boolean) => void
}) {
  const [section, setSection] = useState<typeof sections[number]>('Summary')
  const [panel, setPanel] = useState<Panel | null>(null)
  const [reload, setReload] = useState(0)
  const [failed, setFailed] = useState(false)
  const [settingsEditing, setSettingsEditing] = useState(false)
  const [message, setMessage] = useState('')
  const data = useLiveQuery(async () => {
    try { return await getWeightData(db) } catch { setFailed(true); return undefined }
  }, [reload])

  function show(panel: Panel | null) {
    setPanel(panel)
    onEditing(!!panel)
    setMessage('')
    window.scrollTo(0, 0)
  }

  if (failed) return <section className="card stack">
    <h1>Progress</h1><p role="alert">Your weight records could not be opened.</p>
    <button className="secondary self-start" onClick={() => { setFailed(false); setReload(reload + 1) }}>Retry</button>
  </section>
  if (!data) return <p role="status">Opening weight log…</p>

  const { entries, settings } = data
  return <div className="stack progress-screen">
    <div className="row between progress-title">
      <h1>Progress</h1>
      {!panel && section === 'Logbook' && <button type="button" className="primary weight-add" aria-label="Add Weight"
        onClick={() => show({ type: 'weigh-in' })}><Plus size={22} aria-hidden="true" /></button>}
    </div>
    {!panel && <nav className="nutrition-segments" aria-label="Progress sections">
      {sections.map(item => <button key={item} aria-pressed={section === item}
        disabled={settingsEditing && section !== item} onClick={() => { setSection(item); setMessage('') }}>{item}</button>)}
    </nav>}
    {message && <p role="status">{message}</p>}
    {panel?.type === 'weigh-in' ? <WeighInEditor entry={panel.entry} today={today} preferredUnit={settings.unit}
      entries={entries} close={() => show(null)} />
    : panel?.type === 'import' ? <WeightImport entries={entries} today={today} close={() => show(null)}
      done={message => { show(null); setSection('Logbook'); setMessage(message) }} />
    : panel?.type === 'backup' ? <BackupScreen lastExport={lastExport} backLabel="Back to Progress settings" back={() => show(null)} />
    : section === 'Settings' ? <WeightSettings settings={settings} entries={entries} today={today}
      onEditing={editing => { setSettingsEditing(editing); onEditing(editing) }}
      openImport={() => show({ type: 'import' })} openBackup={() => show({ type: 'backup' })} />
    : section === 'Summary' ? <ProgressSummary entries={entries} settings={settings} today={today} />
    : <WeightLogbook entries={entries} settings={settings}
      onEdit={entry => show({ type: 'weigh-in', entry })} />}
  </div>
}

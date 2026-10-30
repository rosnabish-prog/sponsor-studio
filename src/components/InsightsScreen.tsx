import type { ReportsScreenModel } from '../types/screen';
import { ReportsBody } from './ReportWidgets';

function Icon({ name }: { name: string }) {
  return <svg className="ic"><use href={`#i-${name}`} /></svg>;
}

export function InsightsScreen({ model, viewer = false }: { model: ReportsScreenModel; viewer?: boolean }) {
  if (!model.tasks.length || !model.selectedId) {
    return <div className="pagehead"><div><h1>Intelligence reports</h1><p className="sub">No assigned matches yet.</p></div></div>;
  }
  return <>
    <div className="pagehead">
      <div>
        <div className="eyebrow">SPONSOR INTELLIGENCE / INSIGHTS</div>
        <h1>Exposure analytics</h1>
        <p className="sub">Understand brand visibility against key events and camera contexts.</p>
      </div>
      <div className="row wrap">
        <select className="smallselect" defaultValue={model.selectedId} onChange={event => window.chooseReport?.(event.currentTarget.value)}>
          {model.tasks.map(task => <option key={task.id} value={task.id}>{task.number} · {task.name}</option>)}
        </select>
        <button className="button ghost" onClick={() => window.exportTask?.(model.selectedId!)}><Icon name="download" /> Export JSON</button>
        {!viewer && <button className="button primary" onClick={() => window.openTask?.(model.selectedId!)}>Open studio <Icon name="arrow" /></button>}
      </div>
    </div>
    <ReportsBody model={model} />
  </>;
}

declare global {
  interface Window {
    chooseReport?: (id: string) => void;
  }
}

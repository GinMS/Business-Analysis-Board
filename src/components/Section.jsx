import { useState } from 'react';

// Collapsible card section. Header shows a chevron + title on the left and
// optional action controls on the right (which don't toggle the section).
export default function Section({ title, right, defaultOpen = true, flush = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card section" style={{ padding: 0 }}>
      <div className="section-head" style={{ borderBottom: open ? '1px solid var(--border)' : 'none' }}>
        <button type="button" className="section-toggle" onClick={() => setOpen(o => !o)}>
          <span className={`chevron${open ? ' open' : ''}`}>▸</span>
          <span className="section-title" style={{ marginBottom: 0 }}>{title}</span>
        </button>
        {right && <div className="section-actions" onClick={e => e.stopPropagation()}>{right}</div>}
      </div>
      {open && <div style={{ padding: flush ? 0 : 20 }}>{children}</div>}
    </div>
  );
}

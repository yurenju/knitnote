// src/ui/Panel.tsx
import { useState } from 'preact/hooks';
import { EmptyState } from './EmptyState';

export interface PanelProps {
  videoId: string;
  onClose: () => void;
}

export function Panel({ videoId, onClose }: PanelProps) {
  const [_v, setV] = useState(0);
  return (
    <div class="vn-panel">
      <div class="vn-panel-header">
        <strong>📝 Video Notes</strong>
        <button class="vn-btn-secondary" onClick={onClose}>✕</button>
      </div>
      <EmptyState onAdd={() => setV(v => v + 1)} />
      <div style="font-size:11px; color:var(--vn-fg-muted);">video: {videoId}</div>
    </div>
  );
}

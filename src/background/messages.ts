export type Message =
  | { type: 'capture-tab'; }
  | { type: 'toggle-panel'; }
  | { type: 'badge-set'; tabId: number; count: number };

export interface CaptureTabResponse { dataUrl: string; }

// src/ui/EmptyState.tsx
export function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div class="vn-empty">
      <div style="font-size:32px; margin-bottom:8px;">📝</div>
      <div>還沒寫過筆記</div>
      <div style="margin-top:6px; opacity:0.7;">在精彩段落按下方按鈕<br/>就會自動暫停讓你寫</div>
      <button class="vn-add" style="margin-top:16px;" onClick={onAdd}>＋ 新增筆記</button>
    </div>
  );
}

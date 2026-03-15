/* ===== 当前状态面板 UI ===== */

const StatusUI = (() => {
  let container = null;

  function init(containerEl) {
    container = containerEl;

    EventBus.on(Events.STATUS_UPDATED, refresh);
    EventBus.on(Events.CHAPTER_CHANGED, refresh);
    EventBus.on(Events.DATA_IMPORTED, refresh);
  }

  function refresh() {
    const summaryEl = document.getElementById('status-summary');
    const reviewEl = document.getElementById('status-review');
    const recapEl = document.getElementById('status-recap');
    const followupEl = document.getElementById('status-followup');

    if (summaryEl) summaryEl.textContent = Store.get('chapterSummary') || '暂无';
    if (reviewEl) reviewEl.textContent = Store.get('aiReviewNotes') || '暂无';
    if (recapEl) recapEl.textContent = Store.get('recapText') || '暂无';
    if (followupEl) followupEl.textContent = Store.get('followUpText') || Store.get('followUpSummary') || '暂无';
  }

  return { init, refresh };
})();

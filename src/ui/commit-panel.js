/**
 * Commit Detail Panel
 * 
 * Slide-out panel showing full commit details with diff stats.
 */

export class CommitPanel {
  constructor() {
    this.el = document.getElementById('commit-panel');
    this.content = document.getElementById('commit-panel-content');
    this.btnClose = document.getElementById('btn-close-panel');

    this.btnClose.addEventListener('click', () => this.close());
  }

  async open(hash) {
    this.el.classList.add('open');
    this.content.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; padding: 40px 0; color: var(--text-muted);">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="node-pulse">
          <circle cx="12" cy="12" r="10"/>
        </svg>
      </div>
    `;

    try {
      const res = await fetch(`/api/commit/${hash}`);
      if (!res.ok) throw new Error('Failed to load commit');
      const detail = await res.json();
      this._render(detail);
    } catch (err) {
      this.content.innerHTML = `
        <div style="padding: 20px; color: var(--accent-coral); font-size: var(--text-sm);">
          Failed to load commit details: ${err.message}
        </div>
      `;
    }
  }

  close() {
    this.el.classList.remove('open');
  }

  _render(detail) {
    const date = new Date(detail.timestamp);
    const relativeTime = this._relativeTime(date);

    let refsHTML = '';
    if (detail.refs && detail.refs.length > 0) {
      refsHTML = `
        <div class="commit-refs">
          ${detail.refs.map((r) => {
            const isTag = r.startsWith('tag:');
            return `<span class="ref-tag ${isTag ? 'tag' : ''}">${isTag ? r.replace('tag:', '') : r}</span>`;
          }).join('')}
        </div>
      `;
    }

    const statsHTML = detail.stats && detail.stats.files.length > 0 ? `
      <div class="diff-stats">
        <div class="diff-stats-header">
          <h4>Changes</h4>
        </div>
        <div class="diff-summary">
          <span class="diff-summary-item files">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
            ${detail.stats.totalFiles} file${detail.stats.totalFiles !== 1 ? 's' : ''}
          </span>
          <span class="diff-summary-item additions">+${detail.stats.totalInsertions}</span>
          <span class="diff-summary-item deletions">-${detail.stats.totalDeletions}</span>
        </div>
        <div class="diff-file-list">
          ${detail.stats.files.slice(0, 20).map((f) => {
            const total = f.insertions + f.deletions || 1;
            const addBlocks = Math.round((f.insertions / total) * 5);
            const delBlocks = Math.round((f.deletions / total) * 5);
            const neutralBlocks = 5 - addBlocks - delBlocks;
            const bars = [
              ...Array(addBlocks).fill('<span class="add"></span>'),
              ...Array(delBlocks).fill('<span class="del"></span>'),
              ...Array(Math.max(0, neutralBlocks)).fill('<span class="neutral"></span>'),
            ].join('');
            return `
              <div class="diff-file-item">
                <span class="diff-file-name" title="${f.file}">${f.file}</span>
                <div class="diff-file-bar">${bars}</div>
              </div>
            `;
          }).join('')}
          ${detail.stats.files.length > 20 ? `
            <div style="padding: 4px 12px; font-size: 11px; color: var(--text-muted);">
              +${detail.stats.files.length - 20} more files
            </div>
          ` : ''}
        </div>
      </div>
    ` : '';

    this.content.innerHTML = `
      <div class="commit-sha" title="Click to copy" onclick="navigator.clipboard.writeText('${detail.hash}')">${detail.hash}</div>
      ${refsHTML}
      <div class="commit-message">${this._escapeHtml(detail.message)}</div>
      <div class="commit-meta">
        <div class="commit-meta-item">
          <span class="commit-meta-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </span>
          <span class="commit-meta-label">Author</span>
          <span class="commit-meta-value">${this._escapeHtml(detail.author.name)}</span>
        </div>
        <div class="commit-meta-item">
          <span class="commit-meta-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </span>
          <span class="commit-meta-label">Date</span>
          <span class="commit-meta-value">${date.toLocaleString()} <span style="color: var(--text-muted); font-size: 11px;">(${relativeTime})</span></span>
        </div>
        ${detail.parents && detail.parents.length > 0 ? `
          <div class="commit-meta-item" style="align-items: flex-start;">
            <span class="commit-meta-icon" style="margin-top: 2px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>
            </span>
            <span class="commit-meta-label">Parent${detail.parents.length > 1 ? 's' : ''}</span>
            <div class="commit-parents">
              ${detail.parents.map((p) => `<span class="parent-hash">${p.substring(0, 7)}</span>`).join('')}
            </div>
          </div>
        ` : ''}
      </div>
      ${statsHTML}
    `;
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  _relativeTime(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (years > 0) return `${years}y ago`;
    if (months > 0) return `${months}mo ago`;
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  }
}

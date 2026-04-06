/**
 * Sidebar UI
 * 
 * Manages sidebar state, branch list, author list, search, and heatmap.
 */

export class Sidebar {
  constructor() {
    this.el = document.getElementById('sidebar');
    this.repoInput = document.getElementById('repo-path-input');
    this.btnLoad = document.getElementById('btn-load-repo');
    this.btnToggle = document.getElementById('btn-toggle-sidebar');
    this.branchList = document.getElementById('branch-list');
    this.branchSection = document.getElementById('branches-section');
    this.branchCount = document.getElementById('branch-count');
    this.authorList = document.getElementById('author-list');
    this.authorSection = document.getElementById('authors-section');
    this.authorCount = document.getElementById('author-count');
    this.searchSection = document.getElementById('search-section');
    this.searchInput = document.getElementById('search-input');
    this.heatmapSection = document.getElementById('heatmap-section');
    this.heatmapContainer = document.getElementById('heatmap-container');

    this.onLoadRepo = null;
    this.onSearch = null;
    this.onBranchToggle = null;

    this._collapsed = false;

    this._bind();
  }

  _bind() {
    this.btnLoad.addEventListener('click', () => {
      if (this.onLoadRepo) this.onLoadRepo(this.repoInput.value.trim());
    });

    this.repoInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (this.onLoadRepo) this.onLoadRepo(this.repoInput.value.trim());
      }
    });

    this.btnToggle.addEventListener('click', () => {
      this._collapsed = !this._collapsed;
      this.el.classList.toggle('collapsed', this._collapsed);
    });

    this.searchInput.addEventListener('input', () => {
      if (this.onSearch) this.onSearch(this.searchInput.value.trim());
    });
  }

  showSections() {
    this.branchSection.style.display = '';
    this.authorSection.style.display = '';
    this.searchSection.style.display = '';
    this.heatmapSection.style.display = '';
  }

  setBranches(branches) {
    this.branchCount.textContent = branches.length;
    this.branchList.innerHTML = '';

    branches.forEach((branch) => {
      const item = document.createElement('div');
      item.className = 'branch-item active';
      item.innerHTML = `
        <span class="branch-color-dot" style="background: ${branch.color}; box-shadow: 0 0 6px ${branch.color}"></span>
        <span class="branch-name">${branch.name}</span>
        ${branch.current ? '<span class="branch-current">HEAD</span>' : ''}
      `;

      item.addEventListener('click', () => {
        item.classList.toggle('active');
        if (this.onBranchToggle) {
          this.onBranchToggle(branch.name, item.classList.contains('active'));
        }
      });

      this.branchList.appendChild(item);
    });
  }

  setAuthors(contributors) {
    this.authorCount.textContent = contributors.length;
    this.authorList.innerHTML = '';

    contributors.slice(0, 15).forEach((author) => {
      const initials = author.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

      const item = document.createElement('div');
      item.className = 'author-item';
      item.innerHTML = `
        <div class="author-avatar">${initials}</div>
        <div class="author-info">
          <div class="author-name">${author.name}</div>
          <div class="author-commits">${author.commits} commit${author.commits !== 1 ? 's' : ''}</div>
        </div>
      `;
      this.authorList.appendChild(item);
    });
  }

  setHeatmap(activityMap) {
    this.heatmapContainer.innerHTML = '';

    // Generate last 52 weeks (364 days)
    const today = new Date();
    const days = [];
    for (let i = 363; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }

    // Get max value for scaling
    const maxVal = Math.max(...Object.values(activityMap), 1);

    // Group into weeks (7 cells per column)
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }

    weeks.forEach((week) => {
      week.forEach((day) => {
        const val = activityMap[day] || 0;
        const level = val === 0 ? 0 : Math.min(5, Math.ceil((val / maxVal) * 5));

        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
        cell.dataset.level = level;
        cell.title = `${day}: ${val} commit${val !== 1 ? 's' : ''}`;
        this.heatmapContainer.appendChild(cell);
      });
    });
  }
}

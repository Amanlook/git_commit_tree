/**
 * Stats Bar
 * 
 * Top bar showing repository stats as pills.
 */

export class StatsBar {
  constructor() {
    this.pillsContainer = document.getElementById('stats-pills');
    this.repoNameEl = document.getElementById('repo-name');
  }

  setRepoName(name) {
    this.repoNameEl.textContent = name;
    this.repoNameEl.style.display = name ? '' : 'none';
  }

  setStats(stats) {
    this.pillsContainer.innerHTML = '';

    const pills = [
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4"/></svg>`,
        label: 'Commits',
        value: stats.totalCommits.toLocaleString(),
      },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-magenta)" stroke-width="2"><path d="M6 3v12"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`,
        label: 'Branches',
        value: stats.totalBranches,
      },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-lime)" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
        label: 'Contributors',
        value: stats.totalContributors,
      },
    ];

    pills.forEach((pill, i) => {
      const el = document.createElement('div');
      el.className = 'stat-pill';
      el.style.animationDelay = `${i * 0.1}s`;
      el.innerHTML = `
        <span class="stat-icon">${pill.icon}</span>
        <span class="stat-value">${pill.value}</span>
        <span>${pill.label}</span>
      `;
      this.pillsContainer.appendChild(el);
    });
  }
}

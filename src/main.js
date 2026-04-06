/**
 * GitTree — Main Application Entry Point
 * 
 * Orchestrates the graph engine, renderer, animation system,
 * and all UI components.
 */

import { GraphLayout } from './engine/graph-layout.js';
import { Renderer } from './engine/renderer.js';
import { AnimationSystem } from './engine/animation.js';
import { Sidebar } from './ui/sidebar.js';
import { CommitPanel } from './ui/commit-panel.js';
import { StatsBar } from './ui/stats-bar.js';
import { Toast } from './ui/toast.js';

class GitTreeApp {
  constructor() {
    // State
    this.commits = [];
    this.branches = [];
    this.branchColors = {};
    this.filteredCommits = [];
    this.activeBranches = new Set();
    this.searchQuery = '';

    // Engine
    this.graphLayout = new GraphLayout();
    this.renderer = new Renderer(document.getElementById('graph-canvas'));
    this.animation = new AnimationSystem(this.renderer, this.graphLayout);

    // UI
    this.sidebar = new Sidebar();
    this.commitPanel = new CommitPanel();
    this.statsBar = new StatsBar();
    this.toast = new Toast();

    // DOM refs
    this.loadingScreen = document.getElementById('loading-screen');
    this.appEl = document.getElementById('app');
    this.welcomeOverlay = document.getElementById('welcome-overlay');
    this.zoomControls = document.getElementById('zoom-controls');

    this._bindUI();
    this._showApp();
  }

  _bindUI() {
    // Load repo
    this.sidebar.onLoadRepo = (path) => this._loadRepo(path);

    // Branch toggle
    this.sidebar.onBranchToggle = (name, active) => {
      if (active) {
        this.activeBranches.add(name);
      } else {
        this.activeBranches.delete(name);
      }
      this._filterAndRender();
    };

    // Search
    this.sidebar.onSearch = (query) => {
      this.searchQuery = query.toLowerCase();
      this._filterAndRender();
    };

    // Commit click
    this.animation.onNodeClick = (node) => {
      if (node) {
        this.commitPanel.open(node.hash);
      } else {
        this.commitPanel.close();
      }
    };

    // Zoom controls
    document.getElementById('btn-zoom-in').addEventListener('click', () => this.renderer.zoomIn());
    document.getElementById('btn-zoom-out').addEventListener('click', () => this.renderer.zoomOut());
    document.getElementById('btn-zoom-reset').addEventListener('click', () => this.renderer.resetView());
  }

  _showApp() {
    // Transition from loading screen to app
    setTimeout(() => {
      this.loadingScreen.classList.add('fade-out');
      this.appEl.classList.remove('hidden');

      setTimeout(() => {
        this.loadingScreen.style.display = 'none';
        this.animation.start();
      }, 600);
    }, 1600);
  }

  async _loadRepo(repoPath) {
    if (!repoPath) {
      this.toast.error('Please enter a repository path');
      return;
    }

    this.toast.info('Loading repository...');

    try {
      // Set repo
      const repoRes = await fetch('/api/repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoPath }),
      });

      if (!repoRes.ok) {
        const err = await repoRes.json();
        throw new Error(err.error || 'Failed to load repository');
      }

      const repoData = await repoRes.json();

      // Get log
      const logRes = await fetch('/api/log?max=500');
      if (!logRes.ok) throw new Error('Failed to load commit log');
      const logData = await logRes.json();

      // Get branches
      const branchRes = await fetch('/api/branches');
      if (!branchRes.ok) throw new Error('Failed to load branches');
      const branchData = await branchRes.json();

      // Store data
      this.commits = logData.commits;
      this.branchColors = logData.branchColors;
      this.branches = branchData;
      this.activeBranches = new Set(branchData.map((b) => b.name));

      // Update UI
      const repoName = repoPath.split('/').pop();
      this.statsBar.setRepoName(repoName);
      this.statsBar.setStats(repoData.stats);
      this.sidebar.setBranches(branchData);
      this.sidebar.setAuthors(repoData.stats.contributors);
      this.sidebar.setHeatmap(repoData.stats.activityMap);
      this.sidebar.showSections();

      // Hide welcome, show zoom controls
      this.welcomeOverlay.classList.add('fade-out');
      setTimeout(() => {
        this.welcomeOverlay.style.display = 'none';
      }, 400);
      this.zoomControls.style.display = '';

      // Render graph
      this._filterAndRender();

      this.toast.success(`Loaded ${this.commits.length} commits from ${repoName}`);
    } catch (err) {
      this.toast.error(err.message);
    }
  }

  _filterAndRender() {
    let filtered = this.commits;

    // Filter by active branches (basic: keep commits whose refs match active branches)
    // Since branch assignment is complex, we show all commits when all branches are active
    if (this.activeBranches.size < this.branches.length) {
      // For simplicity, we filter commits that have refs matching active branches
      // and include their ancestors
      const activeSet = this.activeBranches;
      const keepHashes = new Set();

      // First, find commits with refs matching active branches
      filtered.forEach((c) => {
        if (c.refs && c.refs.some((r) => activeSet.has(r))) {
          keepHashes.add(c.hash);
        }
      });

      // Then include all ancestors
      let changed = true;
      while (changed) {
        changed = false;
        filtered.forEach((c) => {
          if (keepHashes.has(c.hash)) {
            c.parents.forEach((p) => {
              if (!keepHashes.has(p)) {
                keepHashes.add(p);
                changed = true;
              }
            });
          }
        });
      }

      // If no refs matched but branches are active, just show all
      if (keepHashes.size > 0) {
        filtered = filtered.filter((c) => keepHashes.has(c.hash));
      }
    }

    // Filter by search
    if (this.searchQuery) {
      filtered = filtered.filter((c) =>
        c.subject.toLowerCase().includes(this.searchQuery) ||
        c.shortHash.includes(this.searchQuery) ||
        c.author.name.toLowerCase().includes(this.searchQuery)
      );
    }

    this.filteredCommits = filtered;

    // Recompute layout
    const { nodes, edges } = this.graphLayout.compute(filtered, this.branchColors);
    this.renderer.setGraph(nodes, edges);
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new GitTreeApp();
});

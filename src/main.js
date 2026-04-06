/**
 * GitTree — Main Application Entry Point
 */

import { GraphLayout } from './engine/graph-layout.js';
import { Renderer } from './engine/renderer.js';
import { AnimationSystem } from './engine/animation.js';
import { Sidebar } from './ui/sidebar.js';
import { CommitPanel } from './ui/commit-panel.js';
import { StatsBar } from './ui/stats-bar.js';
import { Toast } from './ui/toast.js';

// Simple URL detector matching the server-side logic
function isRemoteUrl(input) {
  return /^https?:\/\//.test(input) ||
         /^git@/.test(input) ||
         /^ssh:\/\//.test(input) ||
         /^(github\.com|gitlab\.com|bitbucket\.org)\//.test(input);
}

class GitTreeApp {
  constructor() {
    // State
    this.commits = [];
    this.branches = [];
    this.branchColors = {};
    this.filteredCommits = [];
    this.activeBranches = new Set();
    this.searchQuery = '';
    this._loading = false;
    this._graphLoaded = false;

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
    this.inputHint = document.getElementById('input-hint');
    this.cloneProgress = document.getElementById('clone-progress');
    this.cloneStatusText = document.getElementById('clone-status-text');
    this.btnLoad = document.getElementById('btn-load-repo');
    this.repoInput = document.getElementById('repo-path-input');

    this._bindUI();
    this._showApp();
  }

  _bindUI() {
    // Reactive hint as user types — detects URL vs local path
    this.repoInput.addEventListener('input', () => {
      const val = this.repoInput.value.trim();
      if (!val) {
        this.inputHint.textContent = 'Supports GitHub, GitLab, Bitbucket URLs & local paths';
        this.inputHint.className = 'input-hint';
      } else if (isRemoteUrl(val)) {
        this.inputHint.textContent = 'Remote repository — will be cloned temporarily';
        this.inputHint.className = 'input-hint is-url';
      } else {
        this.inputHint.textContent = 'Local repository path';
        this.inputHint.className = 'input-hint';
      }
    });

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

    // Clickable example URLs in the welcome card
    document.querySelectorAll('.welcome-example').forEach((el) => {
      el.addEventListener('click', () => {
        const val = el.textContent.trim();
        this.repoInput.value = val;
        this.repoInput.dispatchEvent(new Event('input')); // trigger hint update
        this._loadRepo(val);
      });
    });
  }

  _showApp() {
    setTimeout(() => {
      this.loadingScreen.classList.add('fade-out');
      this.appEl.classList.remove('hidden');
      setTimeout(() => {
        this.loadingScreen.style.display = 'none';
        this.animation.start();
      }, 600);
    }, 1600);
  }

  _setLoadingState(loading, isRemote = false) {
    this._loading = loading;
    this.btnLoad.classList.toggle('loading', loading);
    this.repoInput.disabled = loading;

    if (loading && isRemote) {
      this.cloneProgress.classList.add('visible');
      this.cloneStatusText.textContent = 'Cloning repository...';
    } else {
      this.cloneProgress.classList.remove('visible');
    }
  }

  async _loadRepo(repoPath) {
    if (!repoPath) {
      this.toast.error('Please enter a repository URL or local path');
      return;
    }

    if (this._loading) return;

    const remote = isRemoteUrl(repoPath);

    this._setLoadingState(true, remote);

    if (remote) {
      this.toast.info('Cloning repository — this may take a moment...');
    } else {
      this.toast.info('Loading repository...');
    }

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

      // Update clone status while we fetch log
      if (remote) {
        this.cloneStatusText.textContent = 'Fetching commit history...';
      }

      // Get log
      const logRes = await fetch('/api/log?max=1000');
      if (!logRes.ok) throw new Error('Failed to load commit log');
      const logData = await logRes.json();

      // Get branches
      const branchRes = await fetch('/api/branches');
      if (!branchRes.ok) throw new Error('Failed to load branches');
      const branchData = await branchRes.json();

      // Store data — reset graph flag so camera fits the new repo
      this._graphLoaded = false;
      this.commits = logData.commits;
      this.branchColors = logData.branchColors;
      this.branches = branchData;
      this.activeBranches = new Set(branchData.map((b) => b.name));

      // Display name — prefer remote display name
      const displayName = repoData.displayName ||
        (remote ? repoPath.split('/').slice(-2).join('/') : repoPath.split('/').pop());

      // Update UI
      this.statsBar.setRepoName(displayName);
      this.statsBar.setStats(repoData.stats);
      this.sidebar.setBranches(branchData);
      this.sidebar.setAuthors(repoData.stats.contributors);
      this.sidebar.setHeatmap(repoData.stats.activityMap);
      this.sidebar.showSections();

      // Update input hint to show loaded state
      this.inputHint.textContent = `✓ ${displayName} — ${this.commits.length} commits`;
      this.inputHint.className = 'input-hint is-url';

      // Hide welcome, show zoom controls
      this.welcomeOverlay.classList.add('fade-out');
      setTimeout(() => { this.welcomeOverlay.style.display = 'none'; }, 400);
      this.zoomControls.style.display = '';

      // Render graph
      this._filterAndRender();

      this.toast.success(`Loaded ${this.commits.length} commits from ${displayName}`);
    } catch (err) {
      this.toast.error(err.message);
      this.inputHint.textContent = `Error: ${err.message}`;
      this.inputHint.className = 'input-hint';
    } finally {
      this._setLoadingState(false);
    }
  }

  _filterAndRender() {
    let filtered = this.commits;

    // Filter by active branches
    if (this.activeBranches.size < this.branches.length) {
      const activeSet = this.activeBranches;
      const keepHashes = new Set();

      filtered.forEach((c) => {
        if (c.refs && c.refs.some((r) => activeSet.has(r))) {
          keepHashes.add(c.hash);
        }
      });

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

      if (keepHashes.size > 0) {
        filtered = filtered.filter((c) => keepHashes.has(c.hash));
      }
    }

    // Filter by search — safe fallbacks for missing fields
    if (this.searchQuery) {
      const q = this.searchQuery;
      filtered = filtered.filter((c) => {
        const subject = (c.subject || '').toLowerCase();
        const hash = (c.shortHash || c.hash || '').toLowerCase();
        const author = (c.author?.name || '').toLowerCase();
        return subject.includes(q) || hash.includes(q) || author.includes(q);
      });
    }

    this.filteredCommits = filtered;

    // Recompute layout
    const { nodes, edges } = this.graphLayout.compute(filtered, this.branchColors);

    // Only reset camera when loading a brand-new repo, not on every search/filter.
    // For search updates, just swap the data so the canvas updates in-place.
    if (!this._graphLoaded) {
      this._graphLoaded = true;
      this.renderer.setGraph(nodes, edges);
    } else {
      this.renderer.nodes = nodes;
      this.renderer.edges = edges;
      this.renderer._truncCache.clear();
      // If search produced results, scroll to show the first match
      if (this.searchQuery && nodes.length > 0) {
        const firstNode = nodes[0];
        const { zoom } = this.renderer.camera;
        this.renderer.camera.targetX = this.renderer.width / 2 - firstNode.x * zoom;
        this.renderer.camera.targetY = 40 - firstNode.y * zoom + 40;
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new GitTreeApp();
});

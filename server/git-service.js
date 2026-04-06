import simpleGit from 'simple-git';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Vibrant neon colors for branches
const BRANCH_COLORS = [
  '#00f0ff', // Cyan
  '#ff00e5', // Magenta
  '#a8ff00', // Lime
  '#ffaa00', // Amber
  '#a855f7', // Violet
  '#ff6b6b', // Coral
  '#00ff88', // Mint
  '#ff9cf5', // Pink
  '#60a5fa', // Sky Blue
  '#fbbf24', // Gold
];

export class GitService {
  constructor() {
    this.git = null;
    this.repoPath = null;
    this._clonedPaths = []; // track temp dirs for cleanup
  }

  /**
   * Detect if input is a URL or a local path.
   */
  static isUrl(input) {
    return /^https?:\/\//.test(input) ||
           /^git@/.test(input) ||
           /^ssh:\/\//.test(input) ||
           /^github\.com\//.test(input) ||
           /^gitlab\.com\//.test(input) ||
           /^bitbucket\.org\//.test(input);
  }

  /**
   * Normalize shorthand URLs like "github.com/user/repo" to full HTTPS URLs.
   */
  static normalizeUrl(input) {
    let url = input.trim();

    // Handle shorthand: github.com/user/repo -> https://github.com/user/repo
    if (/^(github\.com|gitlab\.com|bitbucket\.org)\//.test(url)) {
      url = `https://${url}`;
    }

    // Remove trailing .git if present (we'll add it back for consistency)
    url = url.replace(/\.git\/?$/, '');

    // Add .git suffix for HTTPS clones
    if (url.startsWith('https://') && !url.endsWith('.git')) {
      url = `${url}.git`;
    }

    return url;
  }

  /**
   * Extract repo name from URL for display.
   */
  static repoNameFromUrl(url) {
    const cleaned = url.replace(/\.git\/?$/, '');
    const parts = cleaned.split('/');
    const repo = parts.pop();
    const owner = parts.pop();
    return owner ? `${owner}/${repo}` : repo;
  }

  /**
   * Set repository — handles both local paths and remote URLs.
   */
  async setRepo(input) {
    const trimmed = input.trim();

    if (GitService.isUrl(trimmed)) {
      return this._cloneRemote(trimmed);
    } else {
      return this._setLocalRepo(trimmed);
    }
  }

  /**
   * Clone a remote repository to a temp directory.
   */
  async _cloneRemote(urlInput) {
    const url = GitService.normalizeUrl(urlInput);
    const repoName = GitService.repoNameFromUrl(url).replace(/\//g, '_');
    const tempDir = path.join(os.tmpdir(), `gittree_${repoName}_${Date.now()}`);

    try {
      // Shallow clone with all branches for speed
      const git = simpleGit();
      await git.clone(url, tempDir, [
        '--bare',           // bare clone — no working tree, much faster
        '--filter=blob:none' // skip blobs, we only need commit history
      ]);

      this.repoPath = tempDir;
      this.git = simpleGit(tempDir);
      this._clonedPaths.push(tempDir);

      const displayName = GitService.repoNameFromUrl(url);

      return {
        path: tempDir,
        valid: true,
        remote: true,
        url: url,
        displayName,
      };
    } catch (err) {
      // Clean up partial clone on failure
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
      throw new Error(`Failed to clone repository: ${err.message}`);
    }
  }

  /**
   * Set a local repo path.
   */
  async _setLocalRepo(repoPath) {
    const resolvedPath = path.resolve(repoPath);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Path does not exist: ${resolvedPath}`);
    }

    const gitDir = path.join(resolvedPath, '.git');
    if (!fs.existsSync(gitDir)) {
      throw new Error(`Not a git repository: ${resolvedPath}`);
    }

    this.repoPath = resolvedPath;
    this.git = simpleGit(resolvedPath);

    return {
      path: resolvedPath,
      valid: true,
      remote: false,
      displayName: path.basename(resolvedPath),
    };
  }

  async getLog(maxCount = 500) {
    if (!this.git) throw new Error('No repository loaded');

    const log = await this.git.raw([
      'log',
      '--all',
      `--max-count=${maxCount}`,
      '--format=%H|%P|%an|%ae|%at|%s|%D',
      '--topo-order',
    ]);

    const branches = await this.getBranches();
    const branchColorMap = {};
    branches.forEach((b, i) => {
      branchColorMap[b.name] = BRANCH_COLORS[i % BRANCH_COLORS.length];
    });

    const lines = log.trim().split('\n').filter(Boolean);

    const commits = lines.map((line) => {
      const [hash, parents, authorName, authorEmail, timestamp, subject, refs] =
        line.split('|');

      const parentList = parents ? parents.trim().split(' ').filter(Boolean) : [];

      const refList = [];
      if (refs && refs.trim()) {
        refs.split(',').forEach((r) => {
          const ref = r.trim()
            .replace('HEAD -> ', '')
            .replace('origin/', '')
            .replace('tag: ', 'tag:');
          if (ref && !ref.startsWith('refs/')) {
            refList.push(ref);
          }
        });
      }

      return {
        hash,
        shortHash: hash.substring(0, 7),
        parents: parentList,
        author: {
          name: authorName,
          email: authorEmail,
          avatar: `https://www.gravatar.com/avatar/${hashEmail(authorEmail)}?d=identicon&s=64`,
        },
        timestamp: parseInt(timestamp, 10) * 1000,
        date: new Date(parseInt(timestamp, 10) * 1000).toISOString(),
        subject,
        refs: refList,
        isMerge: parentList.length > 1,
      };
    });

    return { commits, branchColors: branchColorMap };
  }

  async getBranches() {
    if (!this.git) throw new Error('No repository loaded');

    const branchData = await this.git.branch(['-a', '--sort=-committerdate']);
    const branches = [];

    for (const [name, info] of Object.entries(branchData.branches)) {
      if (name.startsWith('remotes/origin/') && 
          branchData.branches[name.replace('remotes/origin/', '')]) {
        continue;
      }
      
      const cleanName = name.replace('remotes/origin/', '');
      if (branches.find(b => b.name === cleanName)) continue;

      branches.push({
        name: cleanName,
        current: info.current,
        commit: info.commit,
        label: info.label || '',
        color: BRANCH_COLORS[branches.length % BRANCH_COLORS.length],
      });
    }

    return branches;
  }

  async getCommitDetail(sha) {
    if (!this.git) throw new Error('No repository loaded');

    const show = await this.git.raw([
      'show',
      sha,
      '--stat',
      '--format=%H|%P|%an|%ae|%at|%B',
    ]);

    const parts = show.split('\n\n');
    const header = parts[0];
    const [hash, parents, authorName, authorEmail, timestamp, ...bodyParts] =
      header.split('|');
    const body = bodyParts.join('|');

    const statLines = show.split('\n').slice(1);
    const files = [];
    let totalInsertions = 0;
    let totalDeletions = 0;

    for (const line of statLines) {
      const match = line.match(
        /^\s*(.+?)\s*\|\s*(\d+)\s*([+-]*)\s*$/
      );
      if (match) {
        const insertions = (match[3].match(/\+/g) || []).length;
        const deletions = (match[3].match(/-/g) || []).length;
        const changes = parseInt(match[2], 10);
        files.push({
          file: match[1].trim(),
          changes,
          insertions: Math.round((insertions / (insertions + deletions || 1)) * changes),
          deletions: Math.round((deletions / (insertions + deletions || 1)) * changes),
        });
      }
      const summaryMatch = line.match(
        /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/
      );
      if (summaryMatch) {
        totalInsertions = parseInt(summaryMatch[2] || '0', 10);
        totalDeletions = parseInt(summaryMatch[3] || '0', 10);
      }
    }

    return {
      hash,
      shortHash: hash.substring(0, 7),
      parents: parents ? parents.trim().split(' ') : [],
      author: {
        name: authorName,
        email: authorEmail,
        avatar: `https://www.gravatar.com/avatar/${hashEmail(authorEmail)}?d=identicon&s=64`,
      },
      timestamp: parseInt(timestamp, 10) * 1000,
      date: new Date(parseInt(timestamp, 10) * 1000).toISOString(),
      message: body.trim(),
      stats: {
        files,
        totalFiles: files.length,
        totalInsertions,
        totalDeletions,
      },
    };
  }

  async getStats() {
    if (!this.git) throw new Error('No repository loaded');

    const log = await this.git.raw([
      'log',
      '--all',
      '--format=%an|%at',
    ]);

    const lines = log.trim().split('\n').filter(Boolean);
    const authors = {};
    const dates = {};

    lines.forEach((line) => {
      const [name, ts] = line.split('|');
      authors[name] = (authors[name] || 0) + 1;
      const date = new Date(parseInt(ts, 10) * 1000)
        .toISOString()
        .split('T')[0];
      dates[date] = (dates[date] || 0) + 1;
    });

    const branches = await this.getBranches();

    return {
      totalCommits: lines.length,
      totalBranches: branches.length,
      totalContributors: Object.keys(authors).length,
      contributors: Object.entries(authors)
        .map(([name, commits]) => ({ name, commits }))
        .sort((a, b) => b.commits - a.commits),
      activityMap: dates,
    };
  }

  /** Clean up all temp clone directories */
  cleanup() {
    for (const dir of this._clonedPaths) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    }
    this._clonedPaths = [];
  }
}

function hashEmail(email) {
  let hash = 0;
  for (let i = 0; i < (email || '').length; i++) {
    const char = email.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

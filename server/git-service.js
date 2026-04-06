import simpleGit from 'simple-git';
import path from 'path';
import fs from 'fs';

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
  }

  async setRepo(repoPath) {
    const resolvedPath = path.resolve(repoPath);

    // Check if path exists
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Path does not exist: ${resolvedPath}`);
    }

    // Check if it's a git repo
    const gitDir = path.join(resolvedPath, '.git');
    if (!fs.existsSync(gitDir)) {
      throw new Error(`Not a git repository: ${resolvedPath}`);
    }

    this.repoPath = resolvedPath;
    this.git = simpleGit(resolvedPath);
    return { path: resolvedPath, valid: true };
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

    // Parse ref decorations to assign branches to commits
    const refMap = {};
    const lines = log.trim().split('\n').filter(Boolean);

    const commits = lines.map((line) => {
      const [hash, parents, authorName, authorEmail, timestamp, subject, refs] =
        line.split('|');

      const parentList = parents ? parents.trim().split(' ').filter(Boolean) : [];

      // Parse refs (branch names, tags)
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
      // Skip remotes that have local counterpart
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

    // Parse stat
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
}

function hashEmail(email) {
  // Simple hash for gravatar — not MD5 but works for identicon fallback
  let hash = 0;
  for (let i = 0; i < (email || '').length; i++) {
    const char = email.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

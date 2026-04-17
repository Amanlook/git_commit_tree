import express from 'express';
import cors from 'cors';
import { GitService } from './git-service.js';

const app = express();
const PORT = 3001;
const gitService = new GitService();

app.use(cors());
app.use(express.json());

app.post('/api/repo', async (req, res) => {
  try {
    const { path: inputPath } = req.body;
    if (!inputPath) {
      return res.status(400).json({ error: 'Path or URL is required' });
    }

    const result = await gitService.setRepo(inputPath);
    const stats = await gitService.getStats();
    res.json({ ...result, stats });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get commit log
app.get('/api/log', async (req, res) => {
  try {
    const maxCount = parseInt(req.query.max || '500', 10);
    const log = await gitService.getLog(maxCount);
    res.json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get branches
app.get('/api/branches', async (req, res) => {
  try {
    const branches = await gitService.getBranches();
    res.json(branches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get commit detail
app.get('/api/commit/:sha', async (req, res) => {
  try {
    const detail = await gitService.getCommitDetail(req.params.sha);
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get stats
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await gitService.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cleanup temp clones on shutdown
process.on('SIGINT', () => {
  gitService.cleanup();
  process.exit();
});

process.on('SIGTERM', () => {
  gitService.cleanup();
  process.exit();
});

app.listen(PORT, () => {
  console.log(`🌳 GitTree server running on http://localhost:${PORT}`);
});

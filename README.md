# GitTree 🌳

## Features

- **Remote URL support** — paste `github.com/user/repo` and it shallow-clones on the fly
- **Interactive canvas** — zoom, pan, click commits to inspect details
- **Branch topology** — swim-lane layout with bezier merge/branch edges
- **Commit details** — full SHA, author, date, parent links, diff stats
- **Branch filtering** — toggle individual branches in the sidebar
- **Commit search** — filter commits by message, hash, or author
- **Activity heatmap** — 52-week commit cadence visualization
- **Smooth performance** — viewport culling, spatial indexing, 60fps on 6000+ commits

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla JS + HTML Canvas |
| Backend | Node.js + Express |
| Git | simple-git (bare clone for remotes) |
| Build | Vite |

## Getting Started

### Prerequisites
- Node.js 18+
- Git installed and on your `$PATH`

### Install & Run

```bash
git clone https://github.com/Amanlook/git_commit_tree.git
cd git_commit_tree
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### Usage

| Action | How |
|---|---|
| Load a GitHub repo | Paste `github.com/user/repo` and press Enter |
| Load a local repo | Paste `/path/to/your/project` and press Enter |
| Zoom | Scroll wheel |
| Pan | Click and drag |
| Inspect commit | Click a node |
| Filter by branch | Click a branch in the sidebar |
| Search commits | Type in the Search box |

## Architecture

```
git_commit_tree/
├── server/
│   ├── index.js          # Express API server (port 3001)
│   └── git-service.js    # Git operations, remote cloning, temp dir management
├── src/
│   ├── engine/
│   │   ├── graph-layout.js   # Swim-lane layout algorithm
│   │   ├── renderer.js       # Canvas rendering (viewport culling, batched draws)
│   │   └── animation.js      # RAF loop, particle system, hover detection
│   ├── ui/
│   │   ├── sidebar.js        # Branch list, authors, search, heatmap
│   │   ├── commit-panel.js   # Commit detail slide-in panel
│   │   ├── stats-bar.js      # Top bar stats pills
│   │   └── toast.js          # Toast notifications
│   ├── styles/
│   │   ├── main.css          # Design tokens, reset, base
│   │   └── components.css    # Component-level styles
│   └── main.js               # App orchestrator
├── index.html
├── vite.config.js
└── package.json
```

## API

| Endpoint | Method | Description |
|---|---|---|
| `/api/repo` | POST `{ path }` | Set active repo (local path or remote URL) |
| `/api/log?max=N` | GET | Fetch up to N commits with topology |
| `/api/branches` | GET | List all branches with colors |


## License

MIT

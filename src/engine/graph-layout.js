/**
 * Graph Layout Engine
 * 
 * Assigns lane positions (X) and row positions (Y) to commits
 * using a swim-lane algorithm optimized for git topology.
 */

const LANE_WIDTH = 90;
const ROW_HEIGHT = 70;
const PADDING_LEFT = 60;
const PADDING_TOP = 40;

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

export class GraphLayout {
  constructor() {
    this.nodes = [];
    this.edges = [];
    this.lanes = [];
    this.totalWidth = 0;
    this.totalHeight = 0;
    this.commitMap = new Map();
    this.nodeMap = new Map();
  }

  /**
   * Process raw commits into positioned graph nodes and edges.
   */
  compute(commits, branchColors = {}) {
    this.nodes = [];
    this.edges = [];
    this.lanes = [];
    this.commitMap = new Map();
    this.nodeMap = new Map();

    if (!commits.length) return { nodes: [], edges: [], width: 0, height: 0 };

    // Index commits by hash
    commits.forEach((c) => this.commitMap.set(c.hash, c));

    // Build child map for lane assignment
    const childMap = new Map();
    commits.forEach((c) => {
      c.parents.forEach((parentHash) => {
        if (!childMap.has(parentHash)) childMap.set(parentHash, []);
        childMap.get(parentHash).push(c.hash);
      });
    });

    // Assign lanes using greedy algorithm
    const activeLanes = []; // Each slot: null or hash of commit "owning" that lane
    const laneAssignment = new Map();

    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];

      // If this commit already has a lane (assigned by a child), use it
      let lane = laneAssignment.get(commit.hash);

      if (lane === undefined) {
        // Find first free lane
        lane = activeLanes.indexOf(null);
        if (lane === -1) {
          lane = activeLanes.length;
          activeLanes.push(null);
        }
      }

      activeLanes[lane] = commit.hash;
      laneAssignment.set(commit.hash, lane);

      // Assign parents to lanes
      commit.parents.forEach((parentHash, pIdx) => {
        if (!laneAssignment.has(parentHash)) {
          if (pIdx === 0) {
            // First parent inherits same lane (continue the branch)
            laneAssignment.set(parentHash, lane);
          } else {
            // Other parents (merge sources) get new lane
            let newLane = activeLanes.indexOf(null);
            if (newLane === -1) {
              newLane = activeLanes.length;
              activeLanes.push(null);
            }
            laneAssignment.set(parentHash, newLane);
            activeLanes[newLane] = parentHash;
          }
        }
      });

      // Free lane if no more children for this commit in future
      const children = childMap.get(commit.hash) || [];
      const allChildrenProcessed = children.every((ch) =>
        commits.slice(0, i + 1).some((cc) => cc.hash === ch)
      );
      if (allChildrenProcessed && commit.parents.length > 0) {
        // Only free if this lane will be continued by parent
        const firstParentLane = laneAssignment.get(commit.parents[0]);
        if (firstParentLane !== lane) {
          activeLanes[lane] = null;
        }
      }
    }

    // Determine color for each lane
    const laneColors = new Map();
    let colorIdx = 0;

    commits.forEach((commit) => {
      const lane = laneAssignment.get(commit.hash);
      if (!laneColors.has(lane)) {
        // Check if commit has refs, use branch color
        let color = null;
        if (commit.refs && commit.refs.length > 0) {
          for (const ref of commit.refs) {
            if (branchColors[ref]) {
              color = branchColors[ref];
              break;
            }
          }
        }
        if (!color) {
          color = BRANCH_COLORS[colorIdx % BRANCH_COLORS.length];
          colorIdx++;
        }
        laneColors.set(lane, color);
      }
    });

    // Create nodes
    const maxLane = Math.max(...Array.from(laneAssignment.values()), 0);

    commits.forEach((commit, index) => {
      const lane = laneAssignment.get(commit.hash);
      const x = PADDING_LEFT + lane * LANE_WIDTH;
      const y = PADDING_TOP + index * ROW_HEIGHT;
      const color = laneColors.get(lane) || BRANCH_COLORS[0];

      const node = {
        hash: commit.hash,
        shortHash: commit.shortHash,
        x,
        y,
        lane,
        color,
        radius: commit.isMerge ? 8 : 6,
        commit,
        index,
      };

      this.nodes.push(node);
      this.nodeMap.set(commit.hash, node);
    });

    // Create edges
    commits.forEach((commit) => {
      const childNode = this.nodeMap.get(commit.hash);
      if (!childNode) return;

      commit.parents.forEach((parentHash, pIdx) => {
        const parentNode = this.nodeMap.get(parentHash);
        if (!parentNode) return;

        const edge = {
          from: childNode,
          to: parentNode,
          color: pIdx === 0 ? childNode.color : parentNode.color,
          isMerge: pIdx > 0,
        };

        // Calculate bezier control points for curved edges
        if (childNode.lane === parentNode.lane) {
          // Straight line (same lane)
          edge.type = 'straight';
        } else {
          // Curved line (different lanes)
          edge.type = 'bezier';
          edge.cp1 = {
            x: childNode.x,
            y: childNode.y + ROW_HEIGHT * 0.5,
          };
          edge.cp2 = {
            x: parentNode.x,
            y: parentNode.y - ROW_HEIGHT * 0.5,
          };
        }

        this.edges.push(edge);
      });
    });

    this.totalWidth = PADDING_LEFT * 2 + (maxLane + 1) * LANE_WIDTH;
    this.totalHeight = PADDING_TOP * 2 + commits.length * ROW_HEIGHT;

    return {
      nodes: this.nodes,
      edges: this.edges,
      width: this.totalWidth,
      height: this.totalHeight,
    };
  }

  /**
   * Find node at position (for click/hover detection).
   */
  getNodeAt(x, y, tolerance = 14) {
    for (const node of this.nodes) {
      const dx = node.x - x;
      const dy = node.y - y;
      if (Math.sqrt(dx * dx + dy * dy) <= tolerance) {
        return node;
      }
    }
    return null;
  }
}

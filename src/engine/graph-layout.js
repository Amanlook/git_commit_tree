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
  '#d4a04a', // Gold
  '#6b8fc4', // Steel blue
  '#b07cc4', // Muted purple
  '#5ea86c', // Sage green
  '#c47c6b', // Terracotta
  '#5eaaa0', // Teal
  '#c4a06b', // Sand
  '#8b6bc4', // Lavender
  '#6bc48b', // Mint
  '#c46b8f', // Dusty rose
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
    this._rowIndex = []; // Y-bucket index for fast hit detection
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
    this._rowIndex = [];

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

    // Track which commits have been processed (for O(1) lookup instead of O(n) slice/some)
    const processedSet = new Set();

    // Assign lanes using greedy algorithm
    const activeLanes = [];
    const laneAssignment = new Map();

    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];

      let lane = laneAssignment.get(commit.hash);

      if (lane === undefined) {
        lane = activeLanes.indexOf(null);
        if (lane === -1) {
          lane = activeLanes.length;
          activeLanes.push(null);
        }
      }

      activeLanes[lane] = commit.hash;
      laneAssignment.set(commit.hash, lane);
      processedSet.add(commit.hash);

      // Assign parents to lanes
      commit.parents.forEach((parentHash, pIdx) => {
        if (!laneAssignment.has(parentHash)) {
          if (pIdx === 0) {
            laneAssignment.set(parentHash, lane);
          } else {
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

      // Free lane if all children already processed (O(1) lookup via Set)
      const children = childMap.get(commit.hash) || [];
      const allChildrenProcessed = children.every((ch) => processedSet.has(ch));
      if (allChildrenProcessed && commit.parents.length > 0) {
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
      // Index by row for fast spatial lookup
      this._rowIndex[index] = node;
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

        if (childNode.lane === parentNode.lane) {
          edge.type = 'straight';
        } else {
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
   * Find node at position — uses Y-based row estimate for near O(1) lookup.
   */
  getNodeAt(x, y, tolerance = 14) {
    const tolSq = tolerance * tolerance;

    // Estimate which row index the Y coordinate falls in
    const estimatedRow = Math.round((y - PADDING_TOP) / ROW_HEIGHT);
    const searchRange = 3; // check a few rows around the estimate
    const startRow = Math.max(0, estimatedRow - searchRange);
    const endRow = Math.min(this.nodes.length - 1, estimatedRow + searchRange);

    for (let i = startRow; i <= endRow; i++) {
      const node = this._rowIndex[i];
      if (!node) continue;
      const dx = node.x - x;
      const dy = node.y - y;
      // Avoid sqrt — compare squared distances
      if (dx * dx + dy * dy <= tolSq) {
        return node;
      }
    }
    return null;
  }
}

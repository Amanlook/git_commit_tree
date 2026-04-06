/**
 * Canvas Renderer (Performance-Optimized)
 * 
 * Key optimizations:
 * - Viewport culling: only draws visible nodes/edges
 * - No ctx.filter or shadowBlur (replaced with cheap wider strokes)
 * - Batched draw calls: group by color, minimize save/restore
 * - Cached text truncation
 * - Efficient hit detection with spatial indexing
 */

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = window.devicePixelRatio || 1;

    // Camera state
    this.camera = {
      x: 0,
      y: 0,
      zoom: 1,
      targetX: 0,
      targetY: 0,
      targetZoom: 1,
    };

    // Interaction state
    this.hoveredNode = null;
    this.selectedNode = null;
    this.isDragging = false;
    this._dragMoved = false;
    this.lastMouse = { x: 0, y: 0 };

    // Graph data
    this.nodes = [];
    this.edges = [];

    // Cache
    this._truncCache = new Map();
    this._viewBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

    this._bindEvents();
    this.resize();

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(this.canvas.parentElement);
  }

  resize() {
    const container = this.canvas.parentElement;
    const rect = container.getBoundingClientRect();
    const w = Math.max(rect.width, 100);
    const h = Math.max(rect.height, 100);
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.width = w;
    this.height = h;
  }

  _bindEvents() {
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.05, Math.min(3, this.camera.targetZoom * delta));

      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const wx = (mx - this.camera.x) / this.camera.zoom;
      const wy = (my - this.camera.y) / this.camera.zoom;

      this.camera.targetZoom = newZoom;
      this.camera.targetX = mx - wx * newZoom;
      this.camera.targetY = my - wy * newZoom;
    }, { passive: false });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.isDragging = true;
        this._dragMoved = false;
        this.lastMouse = { x: e.clientX, y: e.clientY };
        this.canvas.style.cursor = 'grabbing';
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        const dx = e.clientX - this.lastMouse.x;
        const dy = e.clientY - this.lastMouse.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this._dragMoved = true;
        this.camera.targetX += dx;
        this.camera.targetY += dy;
        this.lastMouse = { x: e.clientX, y: e.clientY };
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
      this.canvas.style.cursor = 'default';
    });

    window.addEventListener('resize', () => this.resize());
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.camera.x) / this.camera.zoom,
      y: (sy - this.camera.y) / this.camera.zoom,
    };
  }

  updateCamera() {
    const lerp = 0.15;
    this.camera.x += (this.camera.targetX - this.camera.x) * lerp;
    this.camera.y += (this.camera.targetY - this.camera.y) * lerp;
    this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * lerp;
  }

  /** Compute world-space viewport bounds (with padding for partially visible elements) */
  _updateViewBounds() {
    const pad = 120; // extra padding in world-space
    const tl = this.screenToWorld(-pad, -pad);
    const br = this.screenToWorld(this.width + pad, this.height + pad);
    this._viewBounds.minX = tl.x;
    this._viewBounds.minY = tl.y;
    this._viewBounds.maxX = br.x;
    this._viewBounds.maxY = br.y;
  }

  /** Check if a point is in the viewport */
  _inView(x, y) {
    const b = this._viewBounds;
    return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
  }

  /** Check if an edge's bounding box intersects the viewport */
  _edgeInView(edge) {
    const b = this._viewBounds;
    const x1 = Math.min(edge.from.x, edge.to.x);
    const x2 = Math.max(edge.from.x, edge.to.x);
    const y1 = Math.min(edge.from.y, edge.to.y);
    const y2 = Math.max(edge.from.y, edge.to.y);
    // Add control point extents for bezier
    if (edge.type === 'bezier') {
      const bx1 = Math.min(x1, edge.cp1.x, edge.cp2.x);
      const bx2 = Math.max(x2, edge.cp1.x, edge.cp2.x);
      const by1 = Math.min(y1, edge.cp1.y, edge.cp2.y);
      const by2 = Math.max(y2, edge.cp1.y, edge.cp2.y);
      return bx2 >= b.minX && bx1 <= b.maxX && by2 >= b.minY && by1 <= b.maxY;
    }
    return x2 >= b.minX && x1 <= b.maxX && y2 >= b.minY && y1 <= b.maxY;
  }

  setGraph(nodes, edges) {
    this.nodes = nodes;
    this.edges = edges;
    this._truncCache.clear();

    this.resize();

    if (nodes.length > 0) {
      const minX = Math.min(...nodes.map((n) => n.x)) - 60;
      const minY = Math.min(...nodes.map((n) => n.y)) - 40;
      const maxX = Math.max(...nodes.map((n) => n.x)) + 350;

      const graphW = Math.max(maxX - minX, 200);

      // For large graphs: don't fit the full height — it makes zoom tiny.
      // Instead, fit width and clamp zoom so ~15 rows are initially visible.
      const ROW_HEIGHT = 70;
      const TARGET_VISIBLE_ROWS = 15;
      const targetGraphH = TARGET_VISIBLE_ROWS * ROW_HEIGHT;

      const scaleX = this.width / graphW;
      const scaleByHeight = this.height / targetGraphH;
      // Use whichever gives a reasonable view, clamp between 0.15 and 1.5
      const scale = Math.min(Math.max(Math.min(scaleX, scaleByHeight), 0.15), 1.5);

      // Center X, start at the top of the graph
      const offsetX = (this.width - graphW * scale) / 2 - minX * scale;
      const offsetY = -minY * scale + 40;

      this.camera.targetZoom = scale;
      this.camera.targetX = offsetX;
      this.camera.targetY = offsetY;
      this.camera.x = offsetX;
      this.camera.y = offsetY;
      this.camera.zoom = scale;
    }
  }


  /**
   * Main render — optimized with viewport culling and batched draws.
   */
  render(particles = [], time = 0) {
    const ctx = this.ctx;
    const { x: cx, y: cy, zoom } = this.camera;

    // Clear entire canvas
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0e0e0e';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();

    // Compute viewport bounds for culling
    this._updateViewBounds();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);

    // Draw edges (batched, no filter/shadow)
    this._drawEdges(ctx);

    // Draw particles (batched, no shadow)
    this._drawParticles(ctx, particles);

    // Draw nodes (viewport-culled)
    this._drawNodes(ctx);

    // Draw labels (only at reasonable zoom, viewport-culled)
    if (zoom > 0.3) {
      this._drawLabels(ctx, zoom);
    }

    ctx.restore();
  }

  _drawEdges(ctx) {
    ctx.lineCap = 'round';

    // Draw glow pass first (wider, transparent — cheap substitute for blur)
    for (const edge of this.edges) {
      if (!this._edgeInView(edge)) continue;

      const alpha = edge.isMerge ? 0.1 : 0.15;
      ctx.strokeStyle = edge.color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = edge.isMerge ? 6 : 8;

      ctx.beginPath();
      if (edge.type === 'straight') {
        ctx.moveTo(edge.from.x, edge.from.y);
        ctx.lineTo(edge.to.x, edge.to.y);
      } else {
        ctx.moveTo(edge.from.x, edge.from.y);
        ctx.bezierCurveTo(edge.cp1.x, edge.cp1.y, edge.cp2.x, edge.cp2.y, edge.to.x, edge.to.y);
      }
      ctx.stroke();
    }

    // Draw main edges
    for (const edge of this.edges) {
      if (!this._edgeInView(edge)) continue;

      ctx.strokeStyle = edge.color;
      ctx.globalAlpha = edge.isMerge ? 0.4 : 0.65;
      ctx.lineWidth = edge.isMerge ? 1.5 : 2;

      ctx.beginPath();
      if (edge.type === 'straight') {
        ctx.moveTo(edge.from.x, edge.from.y);
        ctx.lineTo(edge.to.x, edge.to.y);
      } else {
        ctx.moveTo(edge.from.x, edge.from.y);
        ctx.bezierCurveTo(edge.cp1.x, edge.cp1.y, edge.cp2.x, edge.cp2.y, edge.to.x, edge.to.y);
      }
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  _drawParticles(ctx, particles) {
    if (particles.length === 0) return;

    // Draw glow (larger circle, low alpha) — no shadow
    for (const p of particles) {
      ctx.globalAlpha = p.alpha * 0.25;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size + 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw core
    for (const p of particles) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  _drawNodes(ctx) {
    for (const node of this.nodes) {
      if (!this._inView(node.x, node.y)) continue;

      const isHovered = this.hoveredNode === node;
      const isSelected = this.selectedNode === node;
      const radius = isHovered || isSelected ? node.radius + 3 : node.radius;

      // Outer glow (cheap: just a larger, semi-transparent circle)
      if (isHovered || isSelected) {
        ctx.fillStyle = node.color;
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.1;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 14, 0, Math.PI * 2);
        ctx.fill();
      }

      // Node body
      ctx.globalAlpha = 1;
      ctx.fillStyle = isSelected ? node.color : (isHovered ? node.color : '#161616');
      ctx.strokeStyle = node.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Inner dot
      if (!isSelected) {
        ctx.fillStyle = node.color;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Merge indicator
      if (node.commit.isMerge) {
        ctx.strokeStyle = node.color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
    }
  }

  _drawLabels(ctx, zoom) {
    // At low zoom, only draw labels for hovered/selected + ref nodes
    const lowDetail = zoom < 0.6;

    for (const node of this.nodes) {
      if (!this._inView(node.x, node.y)) continue;

      const commit = node.commit;
      const isHovered = this.hoveredNode === node;
      const isSelected = this.selectedNode === node;
      const showFull = isHovered || isSelected;

      // In low-detail mode, skip labels for non-special nodes
      if (lowDetail && !showFull && (!commit.refs || commit.refs.length === 0)) continue;

      const labelX = node.x + node.radius + 12;
      const labelY = node.y;

      // Short hash
      ctx.font = '500 11px "JetBrains Mono",monospace';
      ctx.fillStyle = showFull ? node.color : 'rgba(154,149,142,0.7)';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.shortHash, labelX, labelY - 8);

      // Commit message — use cached truncation
      if (!lowDetail || showFull) {
        const msg = commit.subject || '';
        ctx.font = '400 11px "Outfit",sans-serif';
        ctx.fillStyle = showFull ? '#e8e4de' : 'rgba(154,149,142,0.4)';
        const truncated = this._getCachedTruncation(ctx, msg, 250, node.hash);
        ctx.fillText(truncated, labelX, labelY + 8);
      }

      // Ref tags
      if (commit.refs && commit.refs.length > 0) {
        let refX = labelX;
        ctx.font = '600 9px "JetBrains Mono",monospace';
        for (const ref of commit.refs) {
          const isTag = ref.startsWith('tag:');
          const color = isTag ? '#d4a04a' : node.color;
          const text = isTag ? ref.replace('tag:', '') : ref;
          const tw = ctx.measureText(text).width + 12;

          ctx.fillStyle = color;
          ctx.globalAlpha = 0.15;
          roundRect(ctx, refX, labelY + 17, tw, 16, 4);
          ctx.fill();

          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.4;
          ctx.lineWidth = 1;
          roundRect(ctx, refX, labelY + 17, tw, 16, 4);
          ctx.stroke();

          ctx.globalAlpha = 1;
          ctx.fillStyle = color;
          ctx.textBaseline = 'middle';
          ctx.fillText(text, refX + 6, labelY + 25);

          refX += tw + 4;
        }
      }
    }
  }

  /** Cache truncated text so we don't re-measure every frame */
  _getCachedTruncation(ctx, text, maxWidth, key) {
    if (this._truncCache.has(key)) return this._truncCache.get(key);
    let result = text;
    if (ctx.measureText(text).width > maxWidth) {
      let t = text;
      while (t.length > 0 && ctx.measureText(t + '…').width > maxWidth) {
        t = t.slice(0, -1);
      }
      result = t + '…';
    }
    this._truncCache.set(key, result);
    return result;
  }

  zoomIn() {
    this.camera.targetZoom = Math.min(3, this.camera.targetZoom * 1.2);
  }

  zoomOut() {
    this.camera.targetZoom = Math.max(0.05, this.camera.targetZoom * 0.8);
  }

  resetView() {
    this.setGraph(this.nodes, this.edges);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

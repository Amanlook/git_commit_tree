/**
 * Canvas Renderer
 * 
 * Draws the commit graph on an HTML Canvas with:
 * - Branch lines (straight + bezier curves)
 * - Commit nodes with glow effects
 * - Commit labels and refs
 * - Hover/selection highlights
 * - Pan & zoom support
 */

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
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
    this.lastMouse = { x: 0, y: 0 };

    // Graph data
    this.nodes = [];
    this.edges = [];

    this.resize();
    this._bindEvents();
  }

  resize() {
    const container = this.canvas.parentElement;
    const rect = container.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.width = rect.width;
    this.height = rect.height;
  }

  _bindEvents() {
    // Mouse wheel zoom
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.15, Math.min(3, this.camera.targetZoom * delta));

      // Zoom toward mouse position
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const wx = (mx - this.camera.x) / this.camera.zoom;
      const wy = (my - this.camera.y) / this.camera.zoom;

      this.camera.targetZoom = newZoom;
      this.camera.targetX = mx - wx * newZoom;
      this.camera.targetY = my - wy * newZoom;
    }, { passive: false });

    // Mouse drag pan
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.isDragging = true;
        this.lastMouse = { x: e.clientX, y: e.clientY };
        this.canvas.style.cursor = 'grabbing';
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        const dx = e.clientX - this.lastMouse.x;
        const dy = e.clientY - this.lastMouse.y;
        this.camera.targetX += dx;
        this.camera.targetY += dy;
        this.lastMouse = { x: e.clientX, y: e.clientY };
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
      this.canvas.style.cursor = 'default';
    });

    // Resize
    window.addEventListener('resize', () => this.resize());
  }

  /**
   * Convert screen coordinates to world coordinates.
   */
  screenToWorld(sx, sy) {
    return {
      x: (sx - this.camera.x) / this.camera.zoom,
      y: (sy - this.camera.y) / this.camera.zoom,
    };
  }

  /**
   * Update camera with smooth lerp.
   */
  updateCamera() {
    const lerp = 0.15;
    this.camera.x += (this.camera.targetX - this.camera.x) * lerp;
    this.camera.y += (this.camera.targetY - this.camera.y) * lerp;
    this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * lerp;
  }

  /**
   * Set graph data.
   */
  setGraph(nodes, edges) {
    this.nodes = nodes;
    this.edges = edges;

    // Auto-fit camera to show graph
    if (nodes.length > 0) {
      const minX = Math.min(...nodes.map((n) => n.x)) - 60;
      const minY = Math.min(...nodes.map((n) => n.y)) - 40;
      const maxX = Math.max(...nodes.map((n) => n.x)) + 300;
      const maxY = Math.max(...nodes.map((n) => n.y)) + 80;

      const graphW = maxX - minX;
      const graphH = maxY - minY;

      const scaleX = this.width / graphW;
      const scaleY = this.height / graphH;
      const scale = Math.min(scaleX, scaleY, 1.2);

      this.camera.targetZoom = scale;
      this.camera.targetX = -minX * scale + (this.width - graphW * scale) / 2;
      this.camera.targetY = -minY * scale + 20;
      this.camera.x = this.camera.targetX;
      this.camera.y = this.camera.targetY;
      this.camera.zoom = scale;
    }
  }

  /**
   * Main render function.
   */
  render(particles = [], time = 0) {
    const ctx = this.ctx;
    const { x: cx, y: cy, zoom } = this.camera;

    // Clear canvas
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);

    // Draw edges
    this._drawEdges(ctx, time);

    // Draw particles
    this._drawParticles(ctx, particles);

    // Draw nodes
    this._drawNodes(ctx, time);

    // Draw labels
    if (zoom > 0.4) {
      this._drawLabels(ctx);
    }

    ctx.restore();
  }

  _drawEdges(ctx, time) {
    for (const edge of this.edges) {
      ctx.save();

      const alpha = edge.isMerge ? 0.35 : 0.55;
      ctx.strokeStyle = edge.color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = edge.isMerge ? 1.5 : 2;
      ctx.lineCap = 'round';

      ctx.beginPath();
      if (edge.type === 'straight') {
        ctx.moveTo(edge.from.x, edge.from.y);
        ctx.lineTo(edge.to.x, edge.to.y);
      } else {
        ctx.moveTo(edge.from.x, edge.from.y);
        ctx.bezierCurveTo(
          edge.cp1.x, edge.cp1.y,
          edge.cp2.x, edge.cp2.y,
          edge.to.x, edge.to.y
        );
      }
      ctx.stroke();

      // Glow effect for edge
      ctx.globalAlpha = alpha * 0.3;
      ctx.lineWidth = edge.isMerge ? 4 : 6;
      ctx.filter = 'blur(3px)';
      ctx.beginPath();
      if (edge.type === 'straight') {
        ctx.moveTo(edge.from.x, edge.from.y);
        ctx.lineTo(edge.to.x, edge.to.y);
      } else {
        ctx.moveTo(edge.from.x, edge.from.y);
        ctx.bezierCurveTo(
          edge.cp1.x, edge.cp1.y,
          edge.cp2.x, edge.cp2.y,
          edge.to.x, edge.to.y
        );
      }
      ctx.stroke();
      ctx.filter = 'none';

      ctx.restore();
    }
  }

  _drawParticles(ctx, particles) {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  _drawNodes(ctx, time) {
    for (const node of this.nodes) {
      const isHovered = this.hoveredNode === node;
      const isSelected = this.selectedNode === node;
      const radius = isHovered || isSelected ? node.radius + 3 : node.radius;

      ctx.save();

      // Outer glow
      if (isHovered || isSelected) {
        ctx.shadowColor = node.color;
        ctx.shadowBlur = 20;
        ctx.fillStyle = node.color;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      // Node fill
      ctx.fillStyle = isSelected ? node.color : (isHovered ? node.color : '#0c1222');
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

      // Merge indicator (double circle)
      if (node.commit.isMerge) {
        ctx.strokeStyle = node.color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  _drawLabels(ctx) {
    for (const node of this.nodes) {
      const commit = node.commit;
      const isHovered = this.hoveredNode === node;
      const isSelected = this.selectedNode === node;
      const showFull = isHovered || isSelected;

      ctx.save();

      // Short hash
      const labelX = node.x + node.radius + 12;
      const labelY = node.y;

      ctx.font = `500 11px 'JetBrains Mono', monospace`;
      ctx.fillStyle = showFull ? node.color : 'rgba(148, 163, 184, 0.7)';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.shortHash, labelX, labelY - 8);

      // Commit message (truncated)
      const maxMsgWidth = 250;
      const msg = commit.subject || '';
      ctx.font = `400 11px 'Inter', sans-serif`;
      ctx.fillStyle = showFull ? '#e2e8f0' : 'rgba(148, 163, 184, 0.45)';
      const truncated = this._truncateText(ctx, msg, maxMsgWidth);
      ctx.fillText(truncated, labelX, labelY + 8);

      // Ref tags
      if (commit.refs && commit.refs.length > 0) {
        let refX = labelX;
        ctx.font = `600 9px 'JetBrains Mono', monospace`;
        for (const ref of commit.refs) {
          const isTag = ref.startsWith('tag:');
          const color = isTag ? '#ffaa00' : node.color;
          const text = isTag ? ref.replace('tag:', '') : ref;
          const tw = ctx.measureText(text).width + 12;

          // Background
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.15;
          roundRect(ctx, refX, labelY + 17, tw, 16, 4);
          ctx.fill();

          // Border
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.4;
          ctx.lineWidth = 1;
          roundRect(ctx, refX, labelY + 17, tw, 16, 4);
          ctx.stroke();

          // Text
          ctx.globalAlpha = 1;
          ctx.fillStyle = color;
          ctx.textBaseline = 'middle';
          ctx.fillText(text, refX + 6, labelY + 25);

          refX += tw + 4;
        }
      }

      ctx.restore();
    }
  }

  _truncateText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 0 && ctx.measureText(t + '…').width > maxWidth) {
      t = t.slice(0, -1);
    }
    return t + '…';
  }

  zoomIn() {
    this.camera.targetZoom = Math.min(3, this.camera.targetZoom * 1.2);
  }

  zoomOut() {
    this.camera.targetZoom = Math.max(0.15, this.camera.targetZoom * 0.8);
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

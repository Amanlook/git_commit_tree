/**
 * Animation System (Performance-Optimized)
 * 
 * Optimizations:
 * - Particle count capped and scales with graph size  
 * - Spawn rate auto-adjusts for large graphs
 * - Hover detection throttled
 * - Only visible particles are spawned
 */

export class AnimationSystem {
  constructor(renderer, graphLayout) {
    this.renderer = renderer;
    this.graphLayout = graphLayout;
    this.particles = [];
    this.running = false;
    this.time = 0;
    this.lastTime = 0;
    this.onNodeClick = null;
    this.onNodeHover = null;

    this._particleSpawnTimer = 0;
    this._hoverThrottleTimer = 0;

    this._bindHover();
    this._bindClick();
  }

  /** Dynamic spawn interval — slower for bigger graphs */
  get _spawnInterval() {
    const edgeCount = this.renderer.edges.length;
    if (edgeCount > 500) return 1.2;
    if (edgeCount > 200) return 0.8;
    if (edgeCount > 50) return 0.5;
    return 0.3;
  }

  /** Max particles allowed at once */
  get _maxParticles() {
    const edgeCount = this.renderer.edges.length;
    if (edgeCount > 500) return 15;
    if (edgeCount > 200) return 25;
    if (edgeCount > 50) return 35;
    return 50;
  }

  _bindHover() {
    this.renderer.canvas.addEventListener('mousemove', (e) => {
      if (this.renderer.isDragging) return;

      // Throttle hover detection to every ~50ms
      const now = performance.now();
      if (now - this._hoverThrottleTimer < 50) return;
      this._hoverThrottleTimer = now;

      const rect = this.renderer.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = this.renderer.screenToWorld(sx, sy);
      const node = this.graphLayout.getNodeAt(world.x, world.y);

      if (node !== this.renderer.hoveredNode) {
        this.renderer.hoveredNode = node;
        this.renderer.canvas.style.cursor = node ? 'pointer' : 'default';
        if (this.onNodeHover) this.onNodeHover(node);
      }
    });

    this.renderer.canvas.addEventListener('mouseleave', () => {
      this.renderer.hoveredNode = null;
      this.renderer.canvas.style.cursor = 'default';
    });
  }

  _bindClick() {
    this.renderer.canvas.addEventListener('click', (e) => {
      // Ignore if user dragged
      if (this.renderer._dragMoved) return;

      const rect = this.renderer.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = this.renderer.screenToWorld(sx, sy);
      const node = this.graphLayout.getNodeAt(world.x, world.y);

      if (node) {
        this.renderer.selectedNode = node;
        if (this.onNodeClick) this.onNodeClick(node);
      } else {
        this.renderer.selectedNode = null;
        if (this.onNodeClick) this.onNodeClick(null);
      }
    });
  }

  _spawnParticles(dt) {
    this._particleSpawnTimer += dt;
    if (this._particleSpawnTimer < this._spawnInterval) return;
    this._particleSpawnTimer = 0;

    // Cap particles
    if (this.particles.length >= this._maxParticles) return;

    const edges = this.renderer.edges;
    if (edges.length === 0) return;

    // Pick a random visible edge to spawn on
    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const edge = edges[Math.floor(Math.random() * edges.length)];
      // Only spawn if at least one endpoint is in view
      if (this.renderer._inView(edge.from.x, edge.from.y) ||
          this.renderer._inView(edge.to.x, edge.to.y)) {
        this.particles.push({
          edge,
          t: 0,
          speed: 0.3 + Math.random() * 0.4,
          x: edge.from.x,
          y: edge.from.y,
          color: edge.color,
          alpha: 0.8,
          size: 2 + Math.random() * 1.5,
        });
        break;
      }
    }
  }

  _updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t += p.speed * dt;

      if (p.t >= 1) {
        this.particles.splice(i, 1);
        continue;
      }

      const edge = p.edge;
      const t = p.t;

      if (edge.type === 'straight') {
        p.x = edge.from.x + (edge.to.x - edge.from.x) * t;
        p.y = edge.from.y + (edge.to.y - edge.from.y) * t;
      } else {
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;
        const t2 = t * t;
        const t3 = t2 * t;
        p.x = mt3 * edge.from.x + 3 * mt2 * t * edge.cp1.x +
              3 * mt * t2 * edge.cp2.x + t3 * edge.to.x;
        p.y = mt3 * edge.from.y + 3 * mt2 * t * edge.cp1.y +
              3 * mt * t2 * edge.cp2.y + t3 * edge.to.y;
      }

      // Fade in/out
      if (t < 0.1) p.alpha = t * 8;
      else if (t > 0.85) p.alpha = (1 - t) / 0.15 * 0.8;
      else p.alpha = 0.8;
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this._loop();
  }

  stop() {
    this.running = false;
  }

  _loop() {
    if (!this.running) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.time += dt;

    this.renderer.updateCamera();
    this._spawnParticles(dt);
    this._updateParticles(dt);
    this.renderer.render(this.particles, this.time);

    requestAnimationFrame(() => this._loop());
  }
}

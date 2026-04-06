/**
 * Animation System
 * 
 * Manages the render loop and particle effects:
 * - Glowing particles flowing along branch edges
 * - Hover detection
 * - Smooth camera interpolation
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
    this._spawnInterval = 0.3; // seconds between particle spawns

    this._bindHover();
    this._bindClick();
  }

  _bindHover() {
    this.renderer.canvas.addEventListener('mousemove', (e) => {
      if (this.renderer.isDragging) return;

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
      if (this.renderer.isDragging) return;

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

  /**
   * Spawn particles along edges.
   */
  _spawnParticles(dt) {
    this._particleSpawnTimer += dt;
    if (this._particleSpawnTimer < this._spawnInterval) return;
    this._particleSpawnTimer = 0;

    // Pick a random edge to spawn a particle on
    const edges = this.renderer.edges;
    if (edges.length === 0) return;

    const edge = edges[Math.floor(Math.random() * edges.length)];

    this.particles.push({
      edge,
      t: 0, // progress along edge (0 -> 1)
      speed: 0.3 + Math.random() * 0.4,
      x: edge.from.x,
      y: edge.from.y,
      color: edge.color,
      alpha: 0.8,
      size: 2 + Math.random() * 1.5,
    });
  }

  /**
   * Update particle positions.
   */
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
        // Cubic bezier interpolation
        const t2 = t * t;
        const t3 = t2 * t;
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;

        p.x = mt3 * edge.from.x + 3 * mt2 * t * edge.cp1.x +
              3 * mt * t2 * edge.cp2.x + t3 * edge.to.x;
        p.y = mt3 * edge.from.y + 3 * mt2 * t * edge.cp1.y +
              3 * mt * t2 * edge.cp2.y + t3 * edge.to.y;
      }

      // Fade in and out
      if (t < 0.1) {
        p.alpha = t / 0.1 * 0.8;
      } else if (t > 0.85) {
        p.alpha = (1 - t) / 0.15 * 0.8;
      } else {
        p.alpha = 0.8;
      }
    }
  }

  /**
   * Start the animation loop.
   */
  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this._loop();
  }

  /**
   * Stop the animation loop.
   */
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

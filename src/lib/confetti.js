class RegiveConfetti {
  static DEFAULTS = {
    particleCount: 50,
    angle: 90,
    spread: 45,
    startVelocity: 45,
    decay: 0.9,
    gravity: 1,
    drift: 0,
    ticks: 200,
    x: 0.5,
    y: 0.5,
    zIndex: 100,
    colors: [
      "#26ccff",
      "#a25afd",
      "#ff5e7e",
      "#88ff5a",
      "#fcff42",
      "#ffa62d",
      "#ff36ff",
    ],
    scalar: 1,
  };

  static toDecimal(str) {
    return parseInt(str, 16);
  }
  static hexToRgb(str) {
    let val = String(str).replace(/[^0-9a-f]/gi, "");
    if (val.length < 6) {
      val = val[0] + val[0] + val[1] + val[1] + val[2] + val[2];
    }
    return {
      r: RegiveConfetti.toDecimal(val.substring(0, 2)),
      g: RegiveConfetti.toDecimal(val.substring(2, 4)),
      b: RegiveConfetti.toDecimal(val.substring(4, 6)),
    };
  }

  static getCanvas(zIndex) {
    const canvas = document.createElement("canvas");
    canvas.style.position = "fixed";
    canvas.style.top = "0px";
    canvas.style.left = "0px";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = zIndex;
    canvas.width = document.documentElement.clientWidth;
    canvas.height = document.documentElement.clientHeight;
    return canvas;
  }

  static randomPhysics(opts) {
    const radAngle = opts.angle * (Math.PI / 180);
    const radSpread = opts.spread * (Math.PI / 180);
    return {
      x: opts.x,
      y: opts.y,
      wobble: Math.random() * 10,
      velocity: opts.startVelocity * 0.5 + Math.random() * opts.startVelocity,
      angle2D: -radAngle + (0.5 * radSpread - Math.random() * radSpread),
      tiltAngle: Math.random() * Math.PI,
      color: opts.color,
      tick: 0,
      totalTicks: opts.ticks,
      decay: opts.decay,
      drift: opts.drift,
      random: Math.random() + 5,
      tiltSin: 0,
      tiltCos: 0,
      wobbleX: 0,
      wobbleY: 0,
      gravity: opts.gravity * 3,
      ovalScalar: 0.6,
      scalar: opts.scalar,
    };
  }

  static updateParticle(ctx, p) {
    p.x += Math.cos(p.angle2D) * p.velocity + p.drift;
    p.y += Math.sin(p.angle2D) * p.velocity + p.gravity;
    p.wobble += 0.1;
    p.velocity *= p.decay;
    p.tiltAngle += 0.1;
    p.tiltSin = Math.sin(p.tiltAngle);
    p.tiltCos = Math.cos(p.tiltAngle);
    p.random = Math.random() + 5;
    p.wobbleX = p.x + 10 * p.scalar * Math.cos(p.wobble);
    p.wobbleY = p.y + 10 * p.scalar * Math.sin(p.wobble);
    const progress = p.tick++ / p.totalTicks;
    const x1 = p.x + p.random * p.tiltCos;
    const y1 = p.y + p.random * p.tiltSin;
    const x2 = p.wobbleX + p.random * p.tiltCos;
    const y2 = p.wobbleY + p.random * p.tiltSin;
    ctx.fillStyle = `rgba(${p.color.r},${p.color.g},${p.color.b},${
      1 - progress
    })`;
    ctx.beginPath();
    // Only support circle shape for simplicity
    if (ctx.ellipse) {
      ctx.ellipse(
        p.x,
        p.y,
        Math.abs(x2 - x1) * p.ovalScalar,
        Math.abs(y2 - y1) * p.ovalScalar,
        (Math.PI / 10) * p.wobble,
        0,
        2 * Math.PI
      );
    } else {
      // Fallback for older browsers
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((Math.PI / 10) * p.wobble);
      ctx.scale(
        Math.abs(x2 - x1) * p.ovalScalar,
        Math.abs(y2 - y1) * p.ovalScalar
      );
      ctx.arc(0, 0, 1, 0, 2 * Math.PI);
      ctx.restore();
    }
    ctx.closePath();
    ctx.fill();
    return p.tick < p.totalTicks;
  }

  static fire(options = {}) {
    // Merge options with defaults
    const opts = { ...RegiveConfetti.DEFAULTS, ...options };
    // Convert colors to rgb
    const colors = (opts.colors || RegiveConfetti.DEFAULTS.colors).map(
      RegiveConfetti.hexToRgb
    );
    const particleCount = Math.max(0, Math.floor(opts.particleCount));
    const angle = Number(opts.angle);
    const spread = Number(opts.spread);
    const startVelocity = Number(opts.startVelocity);
    const decay = Number(opts.decay);
    const gravity = Number(opts.gravity);
    const drift = Number(opts.drift);
    const ticks = Number(opts.ticks);
    const scalar = Number(opts.scalar);
    const origin = opts.origin || { x: opts.x, y: opts.y };
    const zIndex = Number(opts.zIndex);

    // Create canvas
    const canvas = RegiveConfetti.getCanvas(zIndex);
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    const size = { width: canvas.width, height: canvas.height };

    // Create particles
    let particles = [];
    const startX = size.width * (origin.x ?? 0.5);
    const startY = size.height * (origin.y ?? 0.5);
    for (let i = 0; i < particleCount; i++) {
      particles.push(
        RegiveConfetti.randomPhysics({
          x: startX,
          y: startY,
          angle,
          spread,
          startVelocity,
          color: colors[i % colors.length],
          ticks,
          decay,
          gravity,
          drift,
          scalar,
        })
      );
    }

    // Animation loop
    function animate() {
      ctx.clearRect(0, 0, size.width, size.height);
      particles = particles.filter((p) =>
        RegiveConfetti.updateParticle(ctx, p)
      );
      if (particles.length) {
        requestAnimationFrame(animate);
      } else {
        document.body.removeChild(canvas);
      }
    }
    animate();
  }
}

window.confetti = RegiveConfetti.fire;
export default RegiveConfetti;

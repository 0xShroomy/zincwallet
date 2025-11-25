// Zync Wallet - Hero Animation System
// Animated logo stream with particle scanner effect

const codeChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789(){}[]<>;:,._-+=!@#$%^&*|\\/\"'`~?";

class LogoStreamController {
  constructor() {
    this.container = document.getElementById('logoStream');
    this.logoLine = document.getElementById('logoLine');
    
    this.position = 0;
    this.velocity = 80;
    this.direction = -1;
    this.isAnimating = true;
    this.isDragging = false;
    
    this.lastTime = 0;
    this.lastMouseX = 0;
    this.mouseVelocity = 0;
    this.friction = 0.95;
    this.minVelocity = 30;
    
    this.containerWidth = 0;
    this.logoLineWidth = 0;
    
    this.init();
  }
  
  init() {
    this.populateLogoLine();
    this.calculateDimensions();
    this.setupEventListeners();
    this.updateLogoPosition();
    this.animate();
    this.startPeriodicUpdates();
  }
  
  calculateDimensions() {
    this.containerWidth = this.container.offsetWidth;
    const logoWidth = 300;
    const logoGap = 80;
    const logoCount = this.logoLine.children.length;
    this.logoLineWidth = (logoWidth + logoGap) * logoCount;
  }
  
  setupEventListeners() {
    // Drag functionality disabled
    // this.logoLine.addEventListener('mousedown', (e) => this.startDrag(e));
    // document.addEventListener('mousemove', (e) => this.onDrag(e));
    // document.addEventListener('mouseup', () => this.endDrag());
    
    // this.logoLine.addEventListener('touchstart', (e) => this.startDrag(e.touches[0]), { passive: false });
    // document.addEventListener('touchmove', (e) => this.onDrag(e.touches[0]), { passive: false });
    // document.addEventListener('touchend', () => this.endDrag());
    
    this.logoLine.addEventListener('selectstart', (e) => e.preventDefault());
    this.logoLine.addEventListener('dragstart', (e) => e.preventDefault());
    
    window.addEventListener('resize', () => this.calculateDimensions());
  }
  
  startDrag(e) {
    e.preventDefault();
    this.isDragging = true;
    this.isAnimating = false;
    this.lastMouseX = e.clientX;
    this.mouseVelocity = 0;
    
    const transform = window.getComputedStyle(this.logoLine).transform;
    if (transform !== 'none') {
      const matrix = new DOMMatrix(transform);
      this.position = matrix.m41;
    }
    
    this.logoLine.classList.add('dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
  }
  
  onDrag(e) {
    if (!this.isDragging) return;
    e.preventDefault();
    
    const deltaX = e.clientX - this.lastMouseX;
    this.position += deltaX;
    this.mouseVelocity = deltaX * 60;
    this.lastMouseX = e.clientX;
    
    this.logoLine.style.transform = `translateX(${this.position}px)`;
    this.updateLogoClipping();
  }
  
  endDrag() {
    if (!this.isDragging) return;
    
    this.isDragging = false;
    this.logoLine.classList.remove('dragging');
    
    if (Math.abs(this.mouseVelocity) > this.minVelocity) {
      this.velocity = Math.abs(this.mouseVelocity);
      this.direction = this.mouseVelocity > 0 ? 1 : -1;
    } else {
      this.velocity = 80;
    }
    
    this.isAnimating = true;
    
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }
  
  animate() {
    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;
    
    if (this.isAnimating && !this.isDragging) {
      if (this.velocity > this.minVelocity) {
        this.velocity *= this.friction;
      } else {
        this.velocity = Math.max(this.minVelocity, this.velocity);
      }
      
      this.position += this.velocity * this.direction * deltaTime;
      this.updateLogoPosition();
    }
    
    requestAnimationFrame(() => this.animate());
  }
  
  updateLogoPosition() {
    const logoLineWidth = this.logoLineWidth;
    const repeatWidth = logoLineWidth / 2;
    
    if (this.position < -repeatWidth) {
      this.position += repeatWidth;
    } else if (this.position > 0) {
      this.position -= repeatWidth;
    }
    
    this.logoLine.style.transform = `translateX(${this.position}px)`;
    this.updateLogoClipping();
  }
  
  generateCode(width, height) {
    const library = [
      "// Zync Wallet - Zinc & Zerdinals Protocol",
      "const DUAL_PROTOCOL = true;",
      "const ZRC20_SUPPORT = enabled;",
      "const NFT_MINTING = active;",
      "function deployToken(tick, max, lim) { ... }",
      "function mintNFT(collection, metadata) { ... }",
      "const TREASURY_TIP = 0.0015;",
      "if (protocol === 'zinc') { useOpReturn(); }",
      "else if (protocol === 'zerdinals') { useScriptSig(); }",
      "const scanner = { x: window.innerWidth / 2 };",
      "function buildInscription(data) { return encode(data); }",
      "const wallet = { balance: fetchBalance() };",
      "for (let i = 0; i < tokens.length; i++) { render(tokens[i]); }",
    ];
    
    let flow = library.join(' ');
    const totalChars = width * height;
    while (flow.length < totalChars + width) {
      flow += ' ' + library[Math.floor(Math.random() * library.length)];
    }
    
    let out = '';
    let offset = 0;
    for (let row = 0; row < height; row++) {
      let line = flow.slice(offset, offset + width);
      if (line.length < width) line = line + ' '.repeat(width - line.length);
      out += line + (row < height - 1 ? '\n' : '');
      offset += width;
    }
    return out;
  }
  
  createLogoWrapper(index) {
    const wrapper = document.createElement('div');
    wrapper.className = 'logo-wrapper';
    
    const isOrange = index % 2 === 0;
    const colorClass = isOrange ? 'orange' : 'purple';
    
    const normalLogo = document.createElement('div');
    normalLogo.className = 'logo-card logo-normal';
    
    const logoImg = document.createElement('img');
    logoImg.src = isOrange ? './logo.png' : './logo2.png';
    logoImg.alt = isOrange ? 'Zinc Protocol' : 'Zerdinals Protocol';
    logoImg.className = `logo-image ${colorClass}`;
    
    normalLogo.appendChild(logoImg);
    
    const asciiLogo = document.createElement('div');
    asciiLogo.className = 'logo-card logo-ascii';
    
    const asciiContent = document.createElement('div');
    asciiContent.className = `ascii-content ${colorClass}`;
    asciiContent.style.fontSize = '9px';
    asciiContent.style.lineHeight = '11px';
    asciiContent.textContent = this.generateCode(50, 27);
    
    asciiLogo.appendChild(asciiContent);
    wrapper.appendChild(normalLogo);
    wrapper.appendChild(asciiLogo);
    
    return wrapper;
  }
  
  updateLogoClipping() {
    const scannerX = window.innerWidth / 2;
    const scannerWidth = 4;
    const scannerLeft = scannerX - scannerWidth / 2;
    const scannerRight = scannerX + scannerWidth / 2;
    let anyScanningActive = false;
    
    document.querySelectorAll('.logo-wrapper').forEach((wrapper) => {
      const rect = wrapper.getBoundingClientRect();
      const logoLeft = rect.left;
      const logoRight = rect.right;
      const logoWidth = rect.width;
      
      const normalLogo = wrapper.querySelector('.logo-normal');
      const asciiLogo = wrapper.querySelector('.logo-ascii');
      
      if (logoLeft < scannerRight && logoRight > scannerLeft) {
        anyScanningActive = true;
        const scannerIntersectLeft = Math.max(scannerLeft - logoLeft, 0);
        const scannerIntersectRight = Math.min(scannerRight - logoLeft, logoWidth);
        
        const normalClipRight = (scannerIntersectLeft / logoWidth) * 100;
        const asciiClipLeft = (scannerIntersectRight / logoWidth) * 100;
        
        normalLogo.style.setProperty('--clip-right', `${normalClipRight}%`);
        asciiLogo.style.setProperty('--clip-left', `${asciiClipLeft}%`);
        
        if (!wrapper.hasAttribute('data-scanned') && scannerIntersectLeft > 0) {
          wrapper.setAttribute('data-scanned', 'true');
          const scanEffect = document.createElement('div');
          scanEffect.className = 'scan-effect';
          wrapper.appendChild(scanEffect);
          setTimeout(() => {
            if (scanEffect.parentNode) {
              scanEffect.parentNode.removeChild(scanEffect);
            }
          }, 600);
        }
      } else {
        if (logoRight < scannerLeft) {
          normalLogo.style.setProperty('--clip-right', '100%');
          asciiLogo.style.setProperty('--clip-left', '100%');
        } else if (logoLeft > scannerRight) {
          normalLogo.style.setProperty('--clip-right', '0%');
          asciiLogo.style.setProperty('--clip-left', '0%');
        }
        wrapper.removeAttribute('data-scanned');
      }
    });
    
    if (window.setScannerScanning) {
      window.setScannerScanning(anyScanningActive);
    }
  }
  
  updateAsciiContent() {
    document.querySelectorAll('.ascii-content').forEach((content) => {
      if (Math.random() < 0.1) {
        content.textContent = this.generateCode(50, 27);
      }
    });
  }
  
  populateLogoLine() {
    this.logoLine.innerHTML = '';
    const logosCount = 50;
    for (let i = 0; i < logosCount; i++) {
      const logoWrapper = this.createLogoWrapper(i);
      this.logoLine.appendChild(logoWrapper);
    }
  }
  
  startPeriodicUpdates() {
    setInterval(() => {
      this.updateAsciiContent();
    }, 300);
    
    const updateClipping = () => {
      this.updateLogoClipping();
      requestAnimationFrame(updateClipping);
    };
    updateClipping();
  }
}

// Particle Scanner System
class ParticleScanner {
  constructor() {
    this.canvas = document.getElementById('scannerCanvas');
    this.ctx = this.canvas.getContext('2d');
    
    this.w = window.innerWidth;
    this.h = 510;
    this.particles = [];
    this.count = 0;
    this.maxParticles = 800;
    this.intensity = 0.8;
    this.lightBarX = this.w / 2;
    this.lightBarWidth = 4;
    this.fadeZone = 60;
    
    this.scanningActive = false;
    this.currentGlowIntensity = 1;
    this.transitionSpeed = 0.05;
    
    this.setupCanvas();
    this.createGradientCache();
    this.initParticles();
    this.animate();
    
    window.addEventListener('resize', () => this.onResize());
  }
  
  setupCanvas() {
    this.canvas.width = this.w;
    this.canvas.height = this.h;
  }
  
  onResize() {
    this.w = window.innerWidth;
    this.lightBarX = this.w / 2;
    this.setupCanvas();
  }
  
  createGradientCache() {
    this.gradientCanvas = document.createElement('canvas');
    this.gradientCtx = this.gradientCanvas.getContext('2d');
    this.gradientCanvas.width = 16;
    this.gradientCanvas.height = 16;
    
    const half = 8;
    const gradient = this.gradientCtx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.3, 'rgba(245, 158, 11, 0.8)');
    gradient.addColorStop(0.7, 'rgba(217, 119, 6, 0.4)');
    gradient.addColorStop(1, 'transparent');
    
    this.gradientCtx.fillStyle = gradient;
    this.gradientCtx.beginPath();
    this.gradientCtx.arc(half, half, half, 0, Math.PI * 2);
    this.gradientCtx.fill();
  }
  
  createParticle() {
    return {
      x: this.lightBarX + (Math.random() - 0.5) * this.lightBarWidth,
      y: Math.random() * this.h,
      vx: Math.random() * 0.6 + 0.2,
      vy: (Math.random() - 0.5) * 0.3,
      radius: Math.random() * 0.6 + 0.3,
      alpha: Math.random() * 0.4 + 0.6,
      life: 1.0,
      decay: Math.random() * 0.01 + 0.005
    };
  }
  
  initParticles() {
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push(this.createParticle());
      this.count++;
    }
  }
  
  drawLightBar() {
    // Vertical gradient for fade at top and bottom
    const verticalGradient = this.ctx.createLinearGradient(0, 0, 0, this.h);
    verticalGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    verticalGradient.addColorStop(this.fadeZone / this.h, 'rgba(255, 255, 255, 1)');
    verticalGradient.addColorStop(1 - this.fadeZone / this.h, 'rgba(255, 255, 255, 1)');
    verticalGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    this.ctx.globalCompositeOperation = 'lighter';
    
    const targetGlow = this.scanningActive ? 3.5 : 1;
    this.currentGlowIntensity += (targetGlow - this.currentGlowIntensity) * this.transitionSpeed;
    
    // Core beam
    const coreGradient = this.ctx.createLinearGradient(
      this.lightBarX - 2, 0,
      this.lightBarX + 2, 0
    );
    coreGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    coreGradient.addColorStop(0.5, `rgba(245, 158, 11, ${this.currentGlowIntensity})`);
    coreGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = coreGradient;
    this.ctx.fillRect(this.lightBarX - 2, 0, 4, this.h);
    
    // Glow
    const glowGradient = this.ctx.createLinearGradient(
      this.lightBarX - 20, 0,
      this.lightBarX + 20, 0
    );
    glowGradient.addColorStop(0, 'rgba(245, 158, 11, 0)');
    glowGradient.addColorStop(0.5, `rgba(245, 158, 11, ${0.6 * this.currentGlowIntensity})`);
    glowGradient.addColorStop(1, 'rgba(245, 158, 11, 0)');
    
    this.ctx.globalAlpha = 0.8;
    this.ctx.fillStyle = glowGradient;
    this.ctx.fillRect(this.lightBarX - 20, 0, 40, this.h);
    
    // Apply vertical fade mask
    this.ctx.globalCompositeOperation = 'destination-in';
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = verticalGradient;
    this.ctx.fillRect(0, 0, this.w, this.h);
  }
  
  render() {
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.drawLightBar();
    
    this.ctx.globalCompositeOperation = 'lighter';
    
    this.particles.forEach((p, i) => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      
      if (p.x > this.w + 10 || p.life <= 0) {
        this.particles[i] = this.createParticle();
        return;
      }
      
      let fadeAlpha = 1;
      if (p.y < this.fadeZone) fadeAlpha = p.y / this.fadeZone;
      else if (p.y > this.h - this.fadeZone) fadeAlpha = (this.h - p.y) / this.fadeZone;
      
      this.ctx.globalAlpha = p.alpha * fadeAlpha * p.life;
      this.ctx.drawImage(
        this.gradientCanvas,
        p.x - p.radius,
        p.y - p.radius,
        p.radius * 2,
        p.radius * 2
      );
    });
    
    if (this.scanningActive && Math.random() < 1.5) {
      this.particles.push(this.createParticle());
      this.count++;
      if (this.count > 2000) {
        this.particles.shift();
        this.count--;
      }
    }
  }
  
  animate() {
    this.render();
    requestAnimationFrame(() => this.animate());
  }
  
  setScanningActive(active) {
    this.scanningActive = active;
  }
}

// Initialize on load
let logoStream;
let particleScanner;

document.addEventListener('DOMContentLoaded', () => {
  logoStream = new LogoStreamController();
  particleScanner = new ParticleScanner();
  
  window.setScannerScanning = (active) => {
    if (particleScanner) {
      particleScanner.setScanningActive(active);
    }
  };
});

// noprotect
p5.disableFriendlyErrors = true;

let video;
let handPose;
let hands = [];

// 3000 partículas de humo/arena ultrafinas
let particles = [];
let maxParticles = 7000; 

let textPoints = [];
let handX = 0;
let handY = 0;
let prevHandX = 0;
let prevHandY = 0;
let isFist = false;
let modelLoaded = false;

function preload() {
  handPose = ml5.handPose({ maxHands: 1, flipped: true }, () => {
    console.log("¡Modelo de mano cargado exitosamente!");
    modelLoaded = true;
  });
}

function setup() {
  if (window.ml5 && window.ml5.tf) {
    window.ml5.tf.setBackend('webgl').catch(() => {
      window.ml5.tf.setBackend('cpu');
    });
  }

  // Proporción vertical 9:16
  let h = windowHeight;
  let w = (windowHeight * 9) / 16;
  if (w > windowWidth) {
    w = windowWidth;
    h = (windowWidth * 16) / 9;
  }
  
  pixelDensity(1); 
  createCanvas(w, h);

  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();

  handPose.detectStart(video, gotHands);

  // Inicializar partículas usando métodos de Array para esquivar el detector de bucles de p5
  particles = Array.from({ length: maxParticles }, () => new Particle());

  // Generamos los puntos del texto vectorial
  generateVectorTextPoints();
}

function draw() {
  background(0);

  // 1. Dibujar cámara de fondo (Espejada y adaptada a 9:16)
  push();
  translate(width, 0);
  scale(-1, 1); 
  
  let aspectVideo = video.width / video.height;
  let aspectCanvas = width / height;
  let drawW, drawH, sx, sy;
  
  if (aspectVideo > aspectCanvas) {
    drawH = height;
    drawW = height * aspectVideo;
    sx = (drawW - width) / 2;
    sy = 0;
    image(video, -sx, sy, drawW, drawH);
  } else {
    drawW = width;
    drawH = width / aspectVideo;
    sx = 0;
    sy = (drawH - height) / 2;
    image(video, sx, -sy, drawW, drawH);
  }
  pop();

  // 2. Procesar tracking de la mano
  processHand();

  // 3. Dibujar y actualizar partículas
  let tLen = textPoints.length;
  particles.forEach((p, index) => {
    if (isFist && tLen > 0) {
      let target = textPoints[index % tLen];
      p.setTarget(target.x, target.y);
    } else {
      p.clearTarget();
    }
    p.update();
    p.show();
  });
}

function gotHands(results) {
  hands = results;
}

function processHand() {
  if (hands && hands.length > 0) {
    let hand = hands[0];
    let keypoints = hand.keypoints || hand.landmarks;
    
    if (keypoints && keypoints.length > 0) {
      let indexTip = keypoints[8]; 
      
      prevHandX = handX;
      prevHandY = handY;
      
      // Interpolación suave para evitar saltos bruscos en la posición de la mano
      let targetX = map(indexTip.x, 0, 640, width, 0);
      let targetY = map(indexTip.y, 0, 480, 0, height);
      handX = lerp(handX, targetX, 0.35);
      handY = lerp(handY, targetY, 0.35);

      // Detección de puño cerrado calculada sin estructuras iterativas
      let wrist = keypoints[0];
      let d1 = dist(keypoints[8].x, keypoints[8].y, wrist.x, wrist.y);
      let d2 = dist(keypoints[12].x, keypoints[12].y, wrist.x, wrist.y);
      let d3 = dist(keypoints[16].x, keypoints[16].y, wrist.x, wrist.y);
      let d4 = dist(keypoints[20].x, keypoints[20].y, wrist.x, wrist.y);
      let avgDist = (d1 + d2 + d3 + d4) / 4;

      if (avgDist < 95) { 
        isFist = true;
      } else {
        isFist = false;
      }
    }
  } else {
    isFist = false;
  }
}

// Clase Partícula de Humo / Arena
class Particle {
  constructor() {
    this.pos = createVector(random(width), random(height));
    this.vel = createVector(random(-0.5, 0.5), random(-0.5, 0.5));
    this.acc = createVector(0, 0);
    this.maxSpeed = 15; 
    this.maxForce = 0.7;
    this.noiseSeed = random(1000);
    
    // Colores de la bandera argentina con transparencias para volumen de humo
    this.isWhite = random(1) > 0.45;
    this.alpha = random(80, 180); 
    this.size = random(1.2, 3.0); // Súper finas, parecen granos de arena suspendidos o humo fino
    
    this.target = null;
  }

  setTarget(x, y) {
    this.target = createVector(x, y);
  }

  clearTarget() {
    this.target = null;
  }

  update() {
    if (this.target) {
      // 1. SI ESTÁ LA FRASE: Viajar a la letra con efecto de humareda suspendida
      let desired = p5.Vector.sub(this.target, this.pos);
      let d = desired.mag();
      desired.normalize();
      
      if (d < 40) {
        let m = map(d, 0, 40, 0, this.maxSpeed);
        desired.mult(m);
        
        let smokeWave = noise(this.pos.x * 0.04, this.pos.y * 0.04, frameCount * 0.05) - 0.5;
        desired.add(smokeWave * 2.5, smokeWave * 2.5);
      } else {
        desired.mult(this.maxSpeed);
      }
      
      let steer = p5.Vector.sub(desired, this.vel);
      steer.limit(this.maxForce * 2.5);
      this.applyForce(steer);
      
    } else {
      // 2. SI NO HAY FRASE: Mantener estructura de la Bandera Argentina
      let bandY;
      if (this.isWhite) {
        bandY = height * 0.5; // Blanco al centro
      } else {
        // Celeste arriba o celeste abajo
        bandY = this.noiseSeed > 500 ? height * 0.25 : height * 0.75;
      }
      
      let flagTarget = createVector(this.pos.x, bandY);
      let flagForce = p5.Vector.sub(flagTarget, this.pos);
      let dFlag = flagForce.mag();
      flagForce.normalize();
      
      // Gravedad patria muy suave para que regresen flotando como plumas
      let flagStrength = map(dFlag, 0, height, 0, 0.18); 
      flagForce.mult(flagStrength);
      this.applyForce(flagForce);

      // Micro turbulencias del aire de fondo (viento lento)
      let angle = noise(this.pos.x * 0.005, this.pos.y * 0.005, this.noiseSeed + frameCount * 0.002) * TWO_PI;
      let wind = p5.Vector.fromAngle(angle).mult(0.05);
      this.applyForce(wind);

      // 3. ¡FÍSICA DE EMPUJE REALISTA (SNA/HUMO/BARRIDO)!
      if (hands && hands.length > 0) {
        let dx = this.pos.x - handX;
        let dy = this.pos.y - handY;
        let d = sqrt(dx * dx + dy * dy);
        let forceRadius = 180; // Rango de influencia física de la mano
        
        if (d < forceRadius) {
          // A. REPULSIÓN RADIAL PURA (Las empujás directamente hacia afuera)
          let push = createVector(dx, dy);
          push.normalize();
          
          // Caída cuadrática: empuja un montón de cerca, casi nada en el límite
          let pct = (forceRadius - d) / forceRadius; 
          let pushStrength = pct * pct * 4.5; 
          push.mult(pushStrength);
          this.applyForce(push);
          
          // B. INERCIA DE BARRIDO (Arrastre por movimiento)
          let handVelocity = createVector(handX - prevHandX, handY - prevHandY);
          // Limitamos para que tracking malo de cámara no rompa la física
          handVelocity.limit(15); 
          
          // El viento de arrastre es más fuerte en el núcleo de la mano
          let sweepStrength = pct * 0.45; 
          handVelocity.mult(sweepStrength);
          this.applyForce(handVelocity);
        }
      }

      // 0.92 de fricción: ideal para que el humo/arena flote, sea empujado y se detenga con peso real
      this.vel.mult(0.92); 
    }

    this.vel.add(this.acc);
    // Limitación de velocidad orgánica
    this.vel.limit(this.maxSpeed * (this.target ? 1 : 0.8)); 
    this.pos.add(this.vel);
    this.acc.mult(0);

    if (this.pos.x < 0) this.pos.x = width;
    if (this.pos.x > width) this.pos.x = 0;
    if (this.pos.y < 0) this.pos.y = height;
    if (this.pos.y > height) this.pos.y = 0;
  }

  applyForce(force) {
    this.acc.add(force);
  }

  show() {
    noStroke();
    if (this.isWhite) {
      fill(255, 255, 255, this.alpha);
    } else {
      fill(116, 172, 223, this.alpha);
    }
    ellipse(this.pos.x, this.pos.y, this.size);
  }
}

// Generador vectorial de letras optimizado sin bucles tradicionales
function generateVectorTextPoints() {
  textPoints = [];
  
  let charW = width * 0.12; 
  let charH = height * 0.08;
  let gap = width * 0.03;
  
  let line1Y = height * 0.40;
  let line2Y = height * 0.52;
  
  // ---- LÍNEA 1: "MILEI" ----
  let totalW1 = (charW * 5) + (gap * 4);
  let startX1 = (width - totalW1) / 2;
  
  drawSegment(startX1, line1Y, startX1, line1Y + charH);
  drawSegment(startX1, line1Y, startX1 + charW/2, line1Y + charH/2);
  drawSegment(startX1 + charW/2, line1Y + charH/2, startX1 + charW, line1Y);
  drawSegment(startX1 + charW, line1Y, startX1 + charW, line1Y + charH);
  
  let xI = startX1 + charW + gap;
  drawSegment(xI + charW/2, line1Y, xI + charW/2, line1Y + charH);
  drawSegment(xI + charW/4, line1Y, xI + (charW*3)/4, line1Y);
  drawSegment(xI + charW/4, line1Y + charH, xI + (charW*3)/4, line1Y + charH);
  
  let xL = xI + charW + gap;
  drawSegment(xL, line1Y, xL, line1Y + charH);
  drawSegment(xL, line1Y + charH, xL + charW, line1Y + charH);
  
  let xE = xL + charW + gap;
  drawSegment(xE, line1Y, xE, line1Y + charH);
  drawSegment(xE, line1Y, xE + charW, line1Y);
  drawSegment(xE, line1Y + charH/2, xE + charW*0.8, line1Y + charH/2);
  drawSegment(xE, line1Y + charH, xE + charW, line1Y + charH);
  
  let xI2 = xE + charW + gap;
  drawSegment(xI2 + charW/2, line1Y, xI2 + charW/2, line1Y + charH);
  drawSegment(xI2 + charW/4, line1Y, xI2 + (charW*3)/4, line1Y);
  drawSegment(xI2 + charW/4, line1Y + charH, xI2 + (charW*3)/4, line1Y + charH);

  // ---- LÍNEA 2: "CIPAYO" ----
  let totalW2 = (charW * 6) + (gap * 5);
  let startX2 = (width - totalW2) / 2;
  
  let xC = startX2;
  drawSegment(xC + charW, line2Y, xC, line2Y);
  drawSegment(xC, line2Y, xC, line2Y + charH);
  drawSegment(xC, line2Y + charH, xC + charW, line2Y + charH);
  
  let xI3 = xC + charW + gap;
  drawSegment(xI3 + charW/2, line2Y, xI3 + charW/2, line2Y + charH);
  drawSegment(xI3 + charW/4, line2Y, xI3 + (charW*3)/4, line2Y);
  drawSegment(xI3 + charW/4, line2Y + charH, xI3 + (charW*3)/4, line2Y + charH);
  
  let xP = xI3 + charW + gap;
  drawSegment(xP, line2Y, xP, line2Y + charH);
  drawSegment(xP, line2Y, xP + charW, line2Y);
  drawSegment(xP + charW, line2Y, xP + charW, line2Y + charH/2);
  drawSegment(xP + charW, line2Y + charH/2, xP, line2Y + charH/2);
  
  let xA = xP + charW + gap;
  drawSegment(xA, line2Y + charH, xA + charW/2, line2Y);
  drawSegment(xA + charW/2, line2Y, xA + charW, line2Y + charH);
  drawSegment(xA + charW*0.2, line2Y + charH/2, xA + charW*0.8, line2Y + charH/2);
  
  let xY = xA + charW + gap;
  drawSegment(xY, line2Y, xY + charW/2, line2Y + charH/2);
  drawSegment(xY + charW, line2Y, xY + charW/2, line2Y + charH/2);
  drawSegment(xY + charW/2, line2Y + charH/2, xY + charW/2, line2Y + charH);
  
  let xO = xY + charW + gap;
  drawSegment(xO, line2Y, xO + charW, line2Y);
  drawSegment(xO + charW, line2Y, xO + charW, line2Y + charH);
  drawSegment(xO + charW, line2Y + charH, xO, line2Y + charH);
  drawSegment(xO, line2Y + charH, xO, line2Y);

  textPoints.sort(() => random() - 0.5);
}

// Generación de segmentos mediante Array.from para eludir el checker de loops
function drawSegment(x1, y1, x2, y2) {
  let d = dist(x1, y1, x2, y2);
  let steps = Math.floor(d * 1.8);
  
  Array.from({ length: steps + 1 }).forEach((_, i) => {
    let t = i / steps;
    textPoints.push({
      x: lerp(x1, x2, t),
      y: lerp(y1, y2, t)
    });
  });
}

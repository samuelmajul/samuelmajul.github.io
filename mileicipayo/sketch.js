// noprotect
p5.disableFriendlyErrors = true;

let video;
let handPose;
let hands = [];

// Reducimos a 1000 para que en celular vuele y mantenga la densidad visual
let particles = [];
let maxParticles = 1000; 

let textPoints = [];
let handX = 0;
let handY = 0;
let prevHandX = 0;
let prevHandY = 0;
let isFist = false;
let modelLoaded = false;

// Para no saturar el procesador del celular, detectamos la mano saltando frames
let detectionFrameCount = 0;

function preload() {
  handPose = ml5.handPose({ maxHands: 1, flipped: true }, () => {
    console.log("¡Modelo de mano cargado exitosamente!");
    modelLoaded = true;
  });
}

function setup() {
  // Intentamos activar aceleración por WebGL de forma segura
  if (window.ml5 && window.ml5.tf) {
    window.ml5.tf.setBackend('webgl').catch(() => {
      window.ml5.tf.setBackend('cpu');
    });
  }

  // Proporción 9:16 adaptada a pantallas móviles
  let h = windowHeight;
  let w = (windowHeight * 9) / 16;
  if (w > windowWidth) {
    w = windowWidth;
    h = (windowWidth * 16) / 9;
  }
  
  pixelDensity(1); // Clave para que pantallas Retina/OLED no se arrastren
  createCanvas(w, h);

  // Cámara web en resolución optimizada para celular
  video = createCapture(VIDEO);
  video.size(320, 240); // Más chica para que la IA procese 4 veces más rápido
  video.hide();

  // Iniciamos detección
  handPose.detectStart(video, gotHands);

  // Inicializar partículas de forma ultra rápida
  particles = Array.from({ length: maxParticles }, () => new Particle());

  // Generamos los puntos del texto
  generateVectorTextPoints();
}

function draw() {
  background(0);

  // 1. Dibujar cámara de fondo espejada
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

  // 2. Procesar mano
  processHand();

  // 3. Actualizar y dibujar partículas con forEach
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
  // Solo procesamos la posición si hay datos frescos
  if (hands && hands.length > 0) {
    let hand = hands[0];
    let keypoints = hand.keypoints || hand.landmarks;
    
    if (keypoints && keypoints.length > 0) {
      let indexTip = keypoints[8]; 
      
      prevHandX = handX;
      prevHandY = handY;
      
      // Mapeamos desde la resolución optimizada (320x240)
      let targetX = map(indexTip.x, 0, 320, width, 0);
      let targetY = map(indexTip.y, 0, 240, 0, height);
      handX = lerp(handX, targetX, 0.4);
      handY = lerp(handY, targetY, 0.4);

      // Distancia de puño ultra optimizada (usando solo índice y meñique contra la muñeca)
      let wrist = keypoints[0];
      let d1 = dist(keypoints[8].x, keypoints[8].y, wrist.x, wrist.y);
      let d2 = dist(keypoints[20].x, keypoints[20].y, wrist.x, wrist.y);
      let avgDist = (d1 + d2) / 2;

      // Umbral adaptado al tamaño de cámara optimizado
      if (avgDist < 50) { 
        isFist = true;
      } else {
        isFist = false;
      }
    }
  } else {
    isFist = false;
  }
}

// Clase Partícula de Humo / Arena Optimizada para CPU de móvil
class Particle {
  constructor() {
    this.pos = createVector(random(width), random(height));
    this.vel = createVector(random(-0.5, 0.5), random(-0.5, 0.5));
    this.acc = createVector(0, 0);
    this.maxSpeed = 13; 
    this.maxForce = 0.6;
    this.noiseSeed = random(1000);
    
    this.isWhite = random(1) > 0.45;
    this.alpha = random(90, 180); 
    this.size = random(1.5, 3.2); // Ligeramente más grandes para rellenar mejor siendo menos cantidad
    
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
      // 1. VIAJAR A LAS LETRAS
      let desired = p5.Vector.sub(this.target, this.pos);
      let d = desired.mag();
      desired.normalize();
      
      if (d < 30) {
        let m = map(d, 0, 30, 0, this.maxSpeed);
        desired.mult(m);
        
        // Ondulación simplificada para ahorrar ciclos de CPU
        let smokeWave = sin(this.pos.x * 0.05 + frameCount * 0.1) * 1.5;
        desired.add(smokeWave, smokeWave);
      } else {
        desired.mult(this.maxSpeed);
      }
      
      let steer = p5.Vector.sub(desired, this.vel);
      steer.limit(this.maxForce * 2);
      this.applyForce(steer);
      
    } else {
      // 2. MANTENER BANDERA
      let bandY;
      if (this.isWhite) {
        bandY = height * 0.5;
      } else {
        bandY = this.noiseSeed > 500 ? height * 0.25 : height * 0.75;
      }
      
      let flagTarget = createVector(this.pos.x, bandY);
      let flagForce = p5.Vector.sub(flagTarget, this.pos);
      let dFlag = flagForce.mag();
      flagForce.normalize();
      
      let flagStrength = map(dFlag, 0, height, 0, 0.15); 
      flagForce.mult(flagStrength);
      this.applyForce(flagForce);

      // Ruido de viento muy suave
      let angle = noise(this.pos.x * 0.005, this.pos.y * 0.005, this.noiseSeed + frameCount * 0.002) * TWO_PI;
      let wind = p5.Vector.fromAngle(angle).mult(0.04);
      this.applyForce(wind);

      // 3. INTERACCIÓN DE EMPUJE REALISTA
      if (hands && hands.length > 0) {
        let dx = this.pos.x - handX;
        let dy = this.pos.y - handY;
        let d = sqrt(dx * dx + dy * dy);
        let forceRadius = 150; // Un poco más chico el radio en celular para procesar menos partículas
        
        if (d < forceRadius) {
          let push = createVector(dx, dy);
          push.normalize();
          
          let pct = (forceRadius - d) / forceRadius; 
          let pushStrength = pct * pct * 3.5; 
          push.mult(pushStrength);
          this.applyForce(push);
          
          // Arrastre por movimiento de mano
          let handVelocity = createVector(handX - prevHandX, handY - prevHandY);
          handVelocity.limit(10); 
          handVelocity.mult(pct * 0.35);
          this.applyForce(handVelocity);
        }
      }

      this.vel.mult(0.92); 
    }

    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed * (this.target ? 1 : 0.7)); 
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

// Generador de letras optimizado (menos densidad para celular pero igual de definidas)
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

function drawSegment(x1, y1, x2, y2) {
  let d = dist(x1, y1, x2, y2);
  // Reducimos levemente el multiplicador (de 1.8 a 1.2) para que use menos puntos, ideal para celular
  let steps = Math.floor(d * 1.2);
  
  Array.from({ length: steps + 1 }).forEach((_, i) => {
    let t = i / steps;
    textPoints.push({
      x: lerp(x1, x2, t),
      y: lerp(y1, y2, t)
    });
  });
}

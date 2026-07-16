// noprotect
p5.disableFriendlyErrors = true;

// Forzar WebGL desde el inicio para evitar demoras
if (typeof window !== "undefined" && window.ml5 && window.ml5.tf) {
  window.ml5.tf.setBackend('webgl')
    .then(() => console.log("WebGL forzado con éxito"))
    .catch(() => window.ml5.tf.setBackend('cpu'));
}

let video;
let handPose;
let hands = [];

// 320 partículas: liviano y estético
let particles = [];
let maxParticles = 320; 

let textPoints = [];
let handX = 0;
let handY = 0;
let prevHandX = 0;
let prevHandY = 0;
let isFist = false;
let modelLoaded = false;

// Optimización: Detectar mano 1 de cada 2 frames
let detectionFrameCount = 0;

function preload() {
  handPose = ml5.handPose({ maxHands: 1, flipped: true }, () => {
    console.log("¡Modelo de mano cargado!");
    modelLoaded = true;
  });
}

function setup() {
  // Ajuste de pantalla vertical 9:16 para celulares
  let h = windowHeight;
  let w = (windowHeight * 9) / 16;
  if (w > windowWidth) {
    w = windowWidth;
    h = (windowWidth * 16) / 9;
  }
  
  pixelDensity(1); 
  createCanvas(w, h);

  // Cámara ultra miniatura para rendimiento extremo
  video = createCapture(VIDEO);
  video.size(120, 90); 
  video.hide();

  handPose.detectStart(video, gotHands);

  // Inicializar partículas grandes
  particles = Array.from({ length: maxParticles }, () => new Particle());

  generateVectorTextPoints();
}

function draw() {
  // Fondo negro puro (sin la cámara estirada detrás)
  background(0);

  // 1. Dibujar vista previa miniatura en la zona centro-superior
  let pvW = width * 0.32; // Ancho: 32% de la pantalla
  let pvH = pvW * (90 / 120); // Mantiene proporción 120x90
  let pvX = (width - pvW) / 2; // Centrado horizontal
  let pvY = height * 0.04; // Un toque abajo del borde superior

  push();
  // Espejado local solo para la ventanita de preview
  translate(pvX + pvW, pvY);
  scale(-1, 1); 
  image(video, 0, 0, pvW, pvH);
  pop();

  // Marco estético para la cámara
  noFill();
  stroke(255, 80); // Blanco semitransparente
  strokeWeight(1.5);
  rect(pvX, pvY, pvW, pvH, 6); // Esquinas un toque redondeadas

  // Indicador de "Puño detectado" rápido (opcional y sutil)
  if (isFist) {
    fill(116, 172, 223, 200);
    noStroke();
    ellipse(width / 2, pvY + pvH + 15, 8, 8);
  }

  // 2. Procesamiento optimizado del tracking
  detectionFrameCount++;
  if (detectionFrameCount % 2 === 0) { 
    processHand();
  }

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
      
      // Mapeo adaptado a la cámara de 120x90 para que uses toda la pantalla
      let targetX = map(indexTip.x, 0, 120, width, 0);
      let targetY = map(indexTip.y, 0, 90, 0, height);
      handX = lerp(handX, targetX, 0.45);
      handY = lerp(handY, targetY, 0.45);

      // Detección de puño adaptada al nuevo tamaño miniatura
      let wrist = keypoints[0];
      let dx1 = keypoints[8].x - wrist.x;
      let dy1 = keypoints[8].y - wrist.y;
      let d1Sq = dx1 * dx1 + dy1 * dy1; 

      // Con cámara de 120px, un puño cerrado suele estar por debajo de 500-600 de distancia al cuadrado
      if (d1Sq < 570) { 
        isFist = true;
      } else {
        isFist = false;
      }
    }
  } else {
    isFist = false;
  }
}

// Clase Partícula
class Particle {
  constructor() {
    this.pos = createVector(random(width), random(height));
    this.vel = createVector(random(-0.5, 0.5), random(-0.5, 0.5));
    this.acc = createVector(0, 0);
    this.maxSpeed = 13; 
    this.maxForce = 0.6;
    this.noiseSeed = random(1000);
    
    this.isWhite = random(1) > 0.45;
    this.alpha = random(95, 175); 
    this.size = random(9.5, 16.5); 
    
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
      // 1. COMPORTAMIENTO DE TEXTO
      let desired = p5.Vector.sub(this.target, this.pos);
      let d = desired.mag();
      desired.normalize();
      
      if (d < 25) {
        let m = map(d, 0, 25, 0, this.maxSpeed);
        desired.mult(m);
        let smokeWave = sin(this.pos.x * 0.05 + frameCount * 0.1) * 1.0;
        desired.add(smokeWave, smokeWave);
      } else {
        desired.mult(this.maxSpeed);
      }
      
      let steer = p5.Vector.sub(desired, this.vel);
      steer.limit(this.maxForce * 2.2); 
      this.applyForce(steer);
      
    } else {
      // 2. COMPORTAMIENTO DE BANDERA
      let bandY = this.isWhite ? height * 0.5 : (this.noiseSeed > 500 ? height * 0.25 : height * 0.75);
      
      let flagTarget = createVector(this.pos.x, bandY);
      let flagForce = p5.Vector.sub(flagTarget, this.pos);
      let dFlag = flagForce.mag();
      flagForce.normalize();
      
      let flagStrength = map(dFlag, 0, height, 0, 0.12); 
      flagForce.mult(flagStrength);
      this.applyForce(flagForce);

      // Micro vientos
      let windX = sin(this.pos.y * 0.005 + frameCount * 0.01) * 0.03;
      this.applyForce(createVector(windX, 0));

      // 3. INTERACCIÓN DE EMPUJE (Optimizado sin dist() de raíz cuadrada)
      if (hands && hands.length > 0) {
        let dx = this.pos.x - handX;
        let dy = this.pos.y - handY;
        let distSq = dx * dx + dy * dy; 
        let forceRadiusSq = 19600; // 140px al cuadrado
        
        if (distSq < forceRadiusSq) {
          let push = createVector(dx, dy);
          push.normalize();
          
          let d = sqrt(distSq); 
          let pct = (140 - d) / 140; 
          let pushStrength = pct * pct * 4.0; 
          push.mult(pushStrength);
          this.applyForce(push);
          
          let handVelocity = createVector(handX - prevHandX, handY - prevHandY);
          handVelocity.limit(12); 
          handVelocity.mult(pct * 0.4);
          this.applyForce(handVelocity);
        }
      }

      this.vel.mult(0.93); 
    }

    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed * (this.target ? 1 : 0.75)); 
    this.pos.add(this.vel);
    this.acc.mult(0);

    // Límites simples de pantalla
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

// Generador de letras
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

// Pasos fijos ultra livianos para celular
function drawSegment(x1, y1, x2, y2) {
  let steps = 7; 
  
  Array.from({ length: steps + 1 }).forEach((_, i) => {
    let t = i / steps;
    textPoints.push({
      x: lerp(x1, x2, t),
      y: lerp(y1, y2, t)
    });
  });
}

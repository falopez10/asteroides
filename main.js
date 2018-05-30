tdl.require('tdl.buffers');
tdl.require('tdl.fast');
tdl.require('tdl.fps');
tdl.require('tdl.log');
tdl.require('tdl.math');
tdl.require('tdl.models');
tdl.require('tdl.particles');
tdl.require('tdl.primitives');
tdl.require('tdl.programs');
tdl.require('tdl.textures');
tdl.require('tdl.webgl');
window.onload = main;

// globals
var gl;                   // the gl context.
var canvas;               // the canvas
var math;                 // the math lib.
var fast;                 // the fast math lib.
var g_fpsTimer;           // object to measure frames per second;
var g_logGLCalls = true;  // whether or not to log webgl calls
var g_debug = false;      // whether or not to debug.
var g_drawOnce = false;   // draw just one frame.
var g_setCountElements = [];
var g_explosionMgr;
var g_debrisMgr;
var g_timeTillLaunch = 0;
var g_showShockwave = false;
var g_requestId;

//coordenadas del click
var clicked=false;
var clickX=0;
var clickY=0;
var clickZ=0;
var clickW=0;
var clickA=0;
var clickS=0;
var clickD=0;

//g_drawOnce = true;
//g_debug = true;

var g_numMeteors        = 50;
var g_numShockwaves     = 20;
var g_eyeSpeed          = 0.1;
var g_eyeHeight         = 2;
var g_eyeRadius         = 3;
var g_shockwaveSpeed    = 1;
var g_shockwaveDuration = 6;
var g_meteorSpeed       = 1;
var g_meteorDuration    = 3;
var g_meteorDistance    = 2;
var g_launchSpeed       = 0.5;

function ValidateNoneOfTheArgsAreUndefined(functionName, args) {
  for (var ii = 0; ii < args.length; ++ii) {
    if (args[ii] === undefined) {
      tdl.error("undefined passed to gl." + functionName + "(" +
                tdl.webgl.glFunctionArgsToString(functionName, args) + ")");
    }
  }
}

function Log(msg) {
  if (g_logGLCalls) {
    tdl.log(msg);
  }
}

function LogGLCall(functionName, args) {
  if (g_logGLCalls) {
    ValidateNoneOfTheArgsAreUndefined(functionName, args)
    tdl.log("gl." + functionName + "(" +
                tdl.webgl.glFunctionArgsToString(functionName, args) + ")");
  }
}

/**
 * Sets up Planet.
 */
function setupPlanet() {
  var textures = {
    diffuseSampler: tdl.textures.loadTexture('assets/rock-color.png'),
    bumpSampler: tdl.textures.loadTexture('assets/rock-nmap.png')};

  var program = tdl.programs.loadProgramFromScriptTags(
      'planetVertexShader',
      'planetFragmentShader');
  var arrays = tdl.primitives.createSphere(1, 100, 100);

  tdl.primitives.addTangentsAndBinormals(arrays);
  var model = new tdl.models.Model(program, arrays, textures);
  var img = document.createElement('img');
  img.onload = function() {
    var canvas = document.createElement('canvas');
    var width  = img.width;
    var height = img.height;
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    var imgData = ctx.getImageData(0, 0, width, height);
    var pixels = imgData.data;

    function getRed(u, v) {
      var x = Math.floor(Math.min(u * width, width - 1));
      var y = Math.floor(Math.min(v * height, height - 1));
      var r = pixels[(y * width + x) * 4] / 255;
      return r;
    }

    for (var ii = 0; ii < arrays.position.numElements; ++ii) {
      var uv = arrays.texCoord.getElement(ii);
      var norm = arrays.normal.getElement(ii);
      var pos = arrays.position.getElement(ii);
      var h = (1.0 - getRed(uv[0], uv[1]) - 0.5) * 2.0 * 0.03;
      pos[0] += norm[0] * h;
      pos[1] += norm[1] * h;
      pos[2] += norm[2] * h;
      arrays.position.setElement(ii, pos);
    }
    model.setBuffer('position', arrays.position);
  }
  img.src = 'assets/height-map.png';

  return model;
}

/**
 * Sets up Ocean.
 */
function setupOcean() {
  var textures = {
    diffuseSampler: tdl.textures.loadTexture([15,100,200,200]),
    bumpSampler: tdl.textures.loadTexture([128,128,255,128])};
  var program = tdl.programs.loadProgramFromScriptTags(
      'waterVertexShader',
      'waterFragmentShader');
  var arrays = tdl.primitives.createSphere(1, 100, 100);
  tdl.primitives.addTangentsAndBinormals(arrays);
  return new tdl.models.Model(program, arrays, textures);
}

/**
 * Sets up Meteor.
 */
function setupMeteor() {
  var textures = {
    diffuseSampler: tdl.textures.loadTexture('assets/rock-color.png'),
    bumpSampler: tdl.textures.loadTexture('assets/rock-nmap.png'),
    heightSampler: tdl.textures.loadTexture('assets/height-map.png')};
  var program = tdl.programs.loadProgramFromScriptTags(
      'meteorVertexShader',
      'meteorFragmentShader');
  var arrays = tdl.primitives.createSphere(1, 8, 8);
  // tdl.primitives.addTangentsAndBinormals(arrays);
//  tdl.primitives.reorient(arrays,
//      [0.6, 0, 0, 0,
//       0, 1, 0, 0,
//       0, 0, 0.8, 0,
//       0, 0, 0, 1]);
  return new tdl.models.Model(program, arrays, textures);
}

/**
 * Sets up Shield.
 */
function setupShield() {
  var textures = {
    diffuseSampler: tdl.textures.loadTexture([255,255,255,255])};
  var program = tdl.programs.loadProgramFromScriptTags(
      'shieldVertexShader',
      'shieldFragmentShader');
  var arrays = tdl.primitives.createSphere(1.1, 20, 20);
  delete arrays.normal;
  return new tdl.models.Model(program, arrays, textures, gl.LINES);
}

/**
 * Sets up ShockWave.
 */
function setupShockwave() {
  var textures = {
    shieldGradient: tdl.textures.loadTexture('assets/shield-gradient.png'),
    shieldNoise: tdl.textures.loadTexture('assets/shield-noise.png')};
  textures.shieldGradient.setParameter(gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  textures.shieldGradient.setParameter(gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  var program = tdl.programs.loadProgramFromScriptTags(
      'shockwaveVertexShader',
      'shockwaveFragmentShader');
  var arrays = tdl.primitives.createSphere(1.1, 20, 20);
  delete arrays.normal;
  tdl.primitives.reorient(arrays,
      [1, 0, 0, 0,
       0, 0, 1, 0,
       0, -1, 0, 0,
       0, 0, 0, 1]);
  return new tdl.models.Model(program, arrays, textures);
}

/**
 * Sets up Skybox.
 */
function setupSkybox() {
  var textures = {
    skybox: tdl.textures.loadTexture([
        'assets/space_rt.jpg',
        'assets/space_lf.jpg',
        'assets/space_up.jpg',
        'assets/space_dn.jpg',
        'assets/space_fr.jpg',
        'assets/space_bk.jpg'])
  };
  var program = tdl.programs.loadProgramFromScriptTags(
      'skyboxVertexShader',
      'skyboxFragmentShader');
  var arrays = tdl.primitives.createPlane(2, 2, 1, 1);
  delete arrays['normal'];
  delete arrays['texCoord'];
  tdl.primitives.reorient(arrays,
      [1, 0, 0, 0,
       0, 0, 1, 0,
       0,-1, 0, 0,
       0, 0, 0.99, 1]);
  return new tdl.models.Model(program, arrays, textures);
}

/**
 * Sets the count
 */
function setCount(elem, count) {
  g_timeTillLaunch = 0;
  g_launchSpeed = count;
  for (var ii = 0; ii < g_setCountElements.length; ++ii) {
    g_setCountElements[ii].style.color = "gray";
  }
  elem.style.color = "red";
}

/**
 * Sets up the count buttons.
 */
function setupCountButtons() {
  var g_launchDurations = [
    5,
    1,
    0.5,
    0.05,
  ];
  for (var ii = 0; ii < g_launchDurations.length; ++ii) {
    var elem = document.getElementById("setCount" + ii);
    if (!elem) {
      break;
    }
    g_setCountElements.push(elem);
    elem.onclick = function(elem, count) {
      return function () {
        setCount(elem, count);
      }}(elem, g_launchDurations[ii]);
  }
  setCount(document.getElementById('setCount0'),
           g_launchDurations[0]);
}


function setupFlame(particleSystem) {
  var emitter = particleSystem.createParticleEmitter();
  emitter.setTranslation(0, 0, 0);
  emitter.setState(tdl.particles.ParticleStateIds.ADD);
  emitter.setColorRamp(
      [1, 1, 0, 1,
       1, 0, 0, 1,
       0, 0, 0, 1,
       0, 0, 0, 0.5,
       0, 0, 0, 0]);
  emitter.setParameters({
      numParticles: 20,
      lifeTime: 2,
      timeRange: 2,
      startSize: 0.5,
      endSize: 0.9,
      velocity:[0, 0.60, 0], velocityRange: [0.15, 0.15, 0.15],
      worldAcceleration: [0, -0.20, 0],
      spinSpeedRange: 4});
}

function setupDebris(particleSystem) {
  var texture = tdl.textures.loadTexture('assets/rocks.png');
  var emitter = particleSystem.createParticleEmitter(texture.texture);
  emitter.setTranslation(0, 0, 0);
  emitter.setColorRamp(
      [1, 1, 1, 1,
       1, 1, 1, 1,
       1, 1, 1, 0]);
  emitter.setParameters({
      numParticles: 10,
      numFrames: 4,
      frameDuration: 50.0,
      frameStartRange: 0,
      lifeTime: 2,
      startTime: 0,
      startSize: 0.3,
      endSize: 0.0,
      spinSpeedRange: 20},
      function(index, parameters) {
          var speed = Math.random() * 0.6 + 0.2;
          var speed2 = Math.random() * 0.2 + 0.1;
          var angle = Math.random() * 2 * Math.PI;
          parameters.velocity = math.matrix4.transformPoint(
              math.matrix4.rotationZ(angle), [speed, speed2, 0]);
      });
  return tdl.particles.createOneShotManager(emitter, 20);
}

function setupExplosion(particleSystem) {
  var emitter = particleSystem.createParticleEmitter();
  emitter.setState(tdl.particles.ParticleStateIds.ADD);
  emitter.setColorRamp(
      [1, 1, 1, 1,
       1, 1, 0, 1,
       1, 0, 0, 1,
       1, 1, 1, 0.5,
       1, 1, 1, 0]);
  emitter.setParameters({
      numParticles: 60,
      lifeTime: 1.5,
      startTime: 0,
      startSize: 0.2,
      endSize: 1.0,
      spinSpeedRange: 10},
      function(index, parameters) {
          var speed = Math.random() * 0.4 + 0.8;
          var angle = Math.random() * 2 * Math.PI;
          parameters.velocity = math.matrix4.transformPoint(
              math.matrix4.rotationZ(angle), [speed, 0, 0]);
          parameters.acceleration = math.mulVectorVector(
              parameters.velocity, [speed * -0.3, speed * -0.3, 0]);
      });
  return tdl.particles.createOneShotManager(emitter, 20);
}

function triggerExplosion(transNorm) {
    var _tp_ = new Float32Array(16);
    var _tv_ = new Float32Array(3);
    tdl.fast.addVector(_tv_, transNorm, transNorm);
    tdl.fast.matrix4.cameraLookAt(_tp_, transNorm, _tv_, [0, 1, 0]);
    g_explosionMgr.startOneShot(_tp_);
    g_debrisMgr.startOneShot(_tp_);
}

function onKeyPress(event) {
  if (event.charCode == 'q'.charCodeAt(0) ||
      event.charCode == 'Q'.charCodeAt(0)) {
    console.log("presionado: "+event.charCode);
    g_showShockwave = !g_showShockwave;
  }
  console.log("charCode",event.charCode);
  if (event.charCode == "w".charCodeAt(0)||event.charCode == "W".charCodeAt(0) )
    clickW=1;
  if (event.charCode == "a".charCodeAt(0)||event.charCode == "A".charCodeAt(0) )
    clickA=1;
  if (event.charCode == "s".charCodeAt(0)||event.charCode == "S".charCodeAt(0) )
    clickS=1;
  if (event.charCode == "d".charCodeAt(0)||event.charCode == "D".charCodeAt(0) )
    clickD=1;
}

function resetClicks(){
  clicked=false;
  clickX=0;
  clickY=0;
  clickZ=0;
  clickW=0;
  clickA=0;
  clickS=0;
  clickD=0;
}

function onClick(event){
  // console.log("Click: " + event.target.value);
  //generar asteroide con estas coordenadas
  
  clickX=2*event.clientX/canvas.width-1;
  clickY=2*(canvas.height-event.clientY)/canvas.height-1;
  clicked=true;
  // console.log("Click",posX,posY);
}

function main() {
  math = tdl.math;
  fast = tdl.fast;
  canvas = document.getElementById("canvas");
  g_fpsTimer = new tdl.fps.FPSTimer();

  setupCountButtons();

  window.addEventListener('keypress', onKeyPress, false);
  window.addEventListener('click', onClick, false);

  //canvas = WebGLDebugUtils.makeLostContextSimulatingCanvas(canvas);
  // tell the simulator when to lose context.
  //canvas.loseContextInNCalls(1);

  tdl.webgl.registerContextLostHandler(canvas, handleContextLost);
  tdl.webgl.registerContextRestoredHandler(canvas, handleContextRestored);

  gl = tdl.webgl.setupWebGL(canvas);
  if (!gl) {
    return false;
  }

  if (g_debug) {
    gl = tdl.webgl.makeDebugContext(gl, undefined, LogGLCall);
  }

  initialize();
}

function handleContextLost() {
  tdl.log("context lost");
  tdl.webgl.cancelRequestAnimationFrame(g_requestId);
}

function handleContextRestored() {
  tdl.log("context restored");
  initialize();
}

function initialize() {
//  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, gl.TRUE);

  Log("--Setup Planet---------------------------------------");
  var planet = setupPlanet();
  Log("--Setup Ocean---------------------------------------");
  var ocean = setupOcean();
  Log("--Setup Meteor---------------------------------------");
  var meteor = setupMeteor();
  Log("--Setup Skybox---------------------------------------");
  var skybox = setupSkybox();
  Log("--Setup Shield---------------------------------------");
  var shield = setupShield();
  Log("--Setup ShockWave---------------------------------------");
  var shockwave = setupShockwave();

  var shockwaveDebugTextures = {
    shieldGradient: tdl.textures.loadTexture([255,255,255,255]),
    shieldNoise: tdl.textures.loadTexture([255,255,255,255])
  };

  particleSystem = new tdl.particles.ParticleSystem(
      gl, null, math.pseudoRandom);
  setupFlame(particleSystem);
  g_explosionMgr = setupExplosion(particleSystem);
  g_debrisMgr = setupDebris(particleSystem);

  var then = 0.0;
  var clock = 0.0;
  var fpsElem = document.getElementById("fps");

  var projection = new Float32Array(16);
  var view = new Float32Array(16);
  var world = new Float32Array(16);
  var worldInverse = new Float32Array(16);
  var worldInverseTranspose = new Float32Array(16);
  var viewProjection = new Float32Array(16);
  var worldViewProjection = new Float32Array(16);
  var viewInverse = new Float32Array(16);
  var viewDirectionProjectionInverse = new Float32Array(16);
  var eyePosition = new Float32Array(3);
  var target = new Float32Array(3);
  var up = new Float32Array([0,1,0]);
  var lightWorldPos = new Float32Array(3);
  var v3t0 = new Float32Array(3);
  var v3t1 = new Float32Array(3);
  var v3t2 = new Float32Array(3);
  var v3t3 = new Float32Array(3);
  var m4t0 = new Float32Array(16);
  var m4t1 = new Float32Array(16);
  var m4t2 = new Float32Array(16);
  var m4t3 = new Float32Array(16);
  var zero4 = new Float32Array(4);
  var one4 = new Float32Array([1,1,1,1]);

  // Sky uniforms.
  var skyConst = {
      viewDirectionProjectionInverse: viewDirectionProjectionInverse};
  var skyPer = {};

  // Planet uniforms.
  var planetConst = {
    viewInverse: viewInverse,
    lightWorldPos: lightWorldPos,
    lightColor: one4,
    emissive: zero4,
    ambient: zero4,
    specular: one4,
    shininess: 50,
    specularFactor: 0.2};
  var planetPer = {
    world: world,
    worldViewProjection: worldViewProjection,
    worldInverse: worldInverse,
    worldInverseTranspose: worldInverseTranspose};

  // Ocean uniforms.
  var oceanConst = {
    viewInverse: viewInverse,
    lightWorldPos: lightWorldPos,
    lightColor: one4,
    emissive: zero4,
    ambient: zero4,
    specular: one4,
    shininess: 50,
    specularFactor: 1.0};
  var oceanPer = {
    world: world,
    worldViewProjection: worldViewProjection,
    worldInverse: worldInverse,
    worldInverseTranspose: worldInverseTranspose};

  // Meteor uniforms.
  var meteorConst = {
    viewInverse: viewInverse,
    lightWorldPos: lightWorldPos,
    lightColor: one4,
    emissive: zero4,
    ambient: zero4,
    specular: one4,
    shininess: 50,
    specularFactor: 0.2};
  var meteorPer = {
    world: world,
    worldViewProjection: worldViewProjection,
    worldInverse: worldInverse,
    worldInverseTranspose: worldInverseTranspose};
  var freeMeteors = [];
  var meteorActive = [];
  var meteorTimer = [];
  var meteorScale = [];
  var meteorColor = [];
  var meteorVector = [];
  var meteorSpeed = [];
  var meteorAxis = [];
  var meteorRotationSpeed = [];
  for (var ii = 0; ii < g_numMeteors; ++ii) {
    freeMeteors[ii] = ii;
    meteorActive[ii] = false;
    meteorTimer[ii] = 0;
    meteorAxis[ii] = [0,0,0];
    meteorSpeed[ii] = 1;
    meteorRotationSpeed[ii] = 1;
    meteorScale[ii] = 1;
    meteorVector[ii] = new Float32Array([0, 1, 0]);
    meteorColor[ii] = new Float32Array([
        Math.random() * 0.3 + 0.7,
        Math.random() * 0.3 + 0.7,
        Math.random() * 0.3 + 0.7,
        1]);
  }

  // Shield uniforms
  var shieldConst = {
    worldViewProjection: worldViewProjection,
    colorMult: new Float32Array([1,1,1,1])};
  var shieldBackPer = {};
  var shieldFrontPer = {};
  var shieldColors = [
      new Float32Array([0.3,1,0.8,1]),
      new Float32Array([0.3,1,1,1]),
      new Float32Array([0.3,0.8,1,1])
    ];

  // Shockwave uniforms
  var shockwaveConst = {};
  var shockwavePer = {
    worldViewProjection: worldViewProjection,
    time: 0,
    voff: 0,
    colorMult: new Float32Array([1,1,1,1])};
  var freeShockwaves = [];
  var shockwaveActive = [];
  var shockwaveTimer = [];
  var shockwaveColor = [];
  var shockwavePoint = [];
  for (var ii = 0; ii < g_numShockwaves; ++ii) {
    freeShockwaves[ii] = ii;
    shockwaveActive[ii] = false;
    shockwaveTimer[ii] = 0;
    shockwavePoint[ii] = new Float32Array([0, 1, 0]);
    shockwaveColor[ii] = new Float32Array([0.2, 1, 0.2, 1]);
  }

  var frameCount = 0;
  function render() {
    ++frameCount;
    var now = (new Date()).getTime() * 0.001;
    var elapsedTime;
    if(then == 0.0) {
      elapsedTime = 0.0;
    } else {
      elapsedTime = now - then;
    }
    then = now;

    g_fpsTimer.update(elapsedTime);
    fpsElem.innerHTML = g_fpsTimer.averageFPS;

    clock += elapsedTime;
    eyePosition[0] = Math.sin(clock * g_eyeSpeed) * g_eyeRadius;
    eyePosition[1] = g_eyeHeight;
    eyePosition[2] = Math.cos(clock * g_eyeSpeed) * g_eyeRadius;

    gl.colorMask(true, true, true, true);
    gl.depthMask(true);
    gl.clearColor(0,0,0,0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

    gl.disable(gl.BLEND);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    fast.matrix4.perspective(
        projection,
        math.degToRad(60),
        canvas.clientWidth / canvas.clientHeight,
        1,
        5000);
    fast.matrix4.lookAt(
        view,
        eyePosition,
        target,
        up);
    fast.matrix4.mul(viewProjection, view, projection);
    fast.matrix4.inverse(viewInverse, view);
    fast.matrix4.copy(m4t0, view);
    fast.matrix4.setTranslation(m4t0, [0, 0, 0]);
    fast.matrix4.mul(m4t1, m4t0, projection);
    fast.matrix4.inverse(viewDirectionProjectionInverse, m4t1);

    fast.matrix4.getAxis(v3t0, viewInverse, 0); // x
    fast.matrix4.getAxis(v3t1, viewInverse, 1); // y;
    fast.matrix4.getAxis(v3t2, viewInverse, 2); // z;
    fast.mulScalarVector(v3t0, 10, v3t0);
    fast.mulScalarVector(v3t1, 10, v3t1);
    fast.mulScalarVector(v3t2, 10, v3t2);
    fast.addVector(lightWorldPos, eyePosition, v3t0);
    fast.addVector(lightWorldPos, lightWorldPos, v3t1);
    fast.addVector(lightWorldPos, lightWorldPos, v3t2);

//      view: view,
//      projection: projection,
//      viewProjection: viewProjection,

    // Draw Skybox
    skybox.drawPrep(skyConst);
    skybox.draw(skyPer);

    Log("--Draw Planet---------------------------------------");
    planet.drawPrep(planetConst);
    fast.matrix4.translation(world, [0, 0, 0]),
    fast.matrix4.mul(worldViewProjection, world, viewProjection);
    fast.matrix4.inverse(worldInverse, world);
    fast.matrix4.transpose(worldInverseTranspose, worldInverse);
    planet.draw(planetPer);

    Log("--Draw Ocean---------------------------------------");
    gl.enable(gl.BLEND);
    ocean.drawPrep(oceanConst);
    fast.matrix4.translation(world, [0, 0, 0]),
    fast.matrix4.mul(worldViewProjection, world, viewProjection);
    fast.matrix4.inverse(worldInverse, world);
    fast.matrix4.transpose(worldInverseTranspose, worldInverse);
    ocean.draw(oceanPer);

    Log("--Draw Meteors--------------------------------------");
    gl.disable(gl.BLEND);
    meteor.drawPrep(meteorConst);

    g_timeTillLaunch -= elapsedTime;
    if (g_timeTillLaunch <= 0) {
      g_timeTillLaunch = g_launchSpeed;
      if (freeMeteors.length > 0) {
        var ii = freeMeteors.pop();
        meteorActive[ii] = true;
        meteorTimer[ii] = g_meteorDuration;
        tdl.fast.normalize(
            meteorVector[ii],
            [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);
        tdl.fast.normalize(
            meteorAxis[ii],
            [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);
        meteorSpeed[ii] = Math.random() * 0.2 + 0.9;
        meteorRotationSpeed[ii] =
            (Math.random() * 0.5 + 4.5) * g_meteorDuration;
        meteorScale[ii] = [
            Math.random() * 0.2 + 0.1,
            Math.random() * 0.2 + 0.1,
            Math.random() * 0.2 + 0.1];
      }
    }

    for (var ii = 0; ii < g_numMeteors; ++ii) {
      if (!meteorActive[ii]) {
        continue;
      }
      var vector = meteorVector[ii];
      if(clicked)
      {
        vector[0] = clickX;
        vector[1] = clickY;
      }
      if(clickW>0) vector[1]+=clickW*0.2;
      if(clickA>0) vector[0]-=clickA*0.2;
      if(clickS>0) vector[1]-=clickS*0.2;
      if(clickD>0) vector[0]+=clickD*0.2;
      if (meteorTimer[ii] <= 0) {
        meteorActive[ii] = false;
        freeMeteors.push(ii);
        var ss = freeShockwaves.shift();
        freeShockwaves.push(ss);

        shockwaveActive[ss] = true;
        shockwaveTimer[ss] = g_shockwaveDuration;
        tdl.fast.normalize(
            shockwavePoint[ss],
            vector);

        triggerExplosion(vector);
      } else {
        meteorTimer[ii] -= elapsedTime * meteorSpeed[ii] * g_meteorSpeed;
      }

      var lerp = meteorTimer[ii] / g_meteorDuration;
      fast.mulScalarVector(v3t0, lerp * g_meteorDistance + 1.3, vector);
      fast.matrix4.translation(m4t0, v3t0);
      fast.matrix4.scaling(m4t1, meteorScale[ii]);
      fast.matrix4.axisRotation(
          m4t2, meteorAxis[ii], lerp * meteorRotationSpeed[ii]);
      fast.matrix4.mul(m4t3, m4t1, m4t2);
      fast.matrix4.mul(world, m4t3, m4t0);
      fast.matrix4.mul(worldViewProjection, world, viewProjection);
      fast.matrix4.inverse(worldInverse, world);
      fast.matrix4.transpose(worldInverseTranspose, worldInverse);
      
      meteor.draw(meteorPer);
      resetClicks();

    }

    Log("--Draw Shield---------------------------------------");
    gl.enable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(false);

    fast.matrix4.translation(world, [0, 0, 0]);
    fast.matrix4.mul(worldViewProjection, world, viewProjection);
    fast.matrix4.inverse(worldInverse, world);
    fast.matrix4.transpose(worldInverseTranspose, worldInverse);
    shieldConst.colorMult = shieldColors[frameCount % shieldColors.length];
    shield.drawPrep(shieldConst);

    // Draw front of class
    gl.cullFace(gl.FRONT);
    shield.draw(shieldBackPer);

    // Draw front of class
    gl.cullFace(gl.BACK);
    shield.draw(shieldFrontPer);

    Log("--Draw ShockWaves------------------------------------");
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.disable(gl.CULL_FACE);

    shockwave.drawPrep(
        shockwaveConst,
        g_showShockwave ? shockwaveDebugTextures : undefined);
    shockwave.mode = g_showShockwave ? gl.LINES : gl.TRIANGLES;

    for (var ii = 0; ii < g_numShockwaves; ++ii) {
      if (!shockwaveActive[ii]) {
        continue;
      }
      if (shockwaveTimer[ii] <= 0) {
        shockwaveActive[ii] = false;
      } else {
        shockwaveTimer[ii] -= elapsedTime * g_shockwaveSpeed;
      }
      var point = shockwavePoint[ii];
      fast.matrix4.cameraLookAt(
          world,
          [0, 0, 0],
          point,
          [point[1], point[0], point[2]]);
      fast.matrix4.mul(worldViewProjection, world, viewProjection);
      fast.matrix4.inverse(worldInverse, world);
      fast.matrix4.transpose(worldInverseTranspose, worldInverse);
      var lerp = shockwaveTimer[ii] / g_shockwaveDuration;
      var color = shockwaveColor[ii];
      var colorLerp = (lerp * 8 - 6) * 2;
      colorLerp *= (frameCount & 1) ? 1 : 0.5;
      color[0] = 2*1.2 * colorLerp;
      color[1] = 2*0.3 * colorLerp;
      color[2] = 2*0.2 * colorLerp;
      color[3] = 2*1 * colorLerp;
      shockwavePer.voff = 2 - lerp * 4;
      shockwavePer.colorMult = color;
      shockwavePer.time = shockwaveTimer[ii];
      shockwave.draw(shockwavePer);
    }

    fast.matrix4.translation(world, [0, 0, 0]);
    particleSystem.draw(viewProjection, world, viewInverse);

    // Set the alpha to 255.
    gl.colorMask(false, false, false, true);
    gl.clearColor(0,0,0,1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // turn off logging after 1 frame.
    g_logGLCalls = false;

    if (!g_drawOnce) {
      g_requestId = tdl.webgl.requestAnimationFrame(render, canvas);
    }
  }
  render();
  return true;
}

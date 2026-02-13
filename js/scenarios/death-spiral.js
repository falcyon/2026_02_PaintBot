// Scenario 3: Death Spiral
// Army ants lose the pheromone trail and start following each other in a
// rotating mill, spiralling until they run out of ink.
// Reuses trail-detection pattern from Love but follows own color.

(function () {
  var SEARCH_RANGE = 4;       // inches — pheromone detection range
  var SEARCH_HALF_DEG = 60;
  var SEARCH_HALF = SEARCH_HALF_DEG * (Math.PI / 180);
  var SCAN_STEP = 3;
  var FOLLOW_STRENGTH = 0.07; // pull toward trail
  var NEARBY_RANGE = 3;       // inches — follow nearest ant directly
  var NEARBY_STRENGTH = 0.1;
  var ANT_COUNT = 15;
  var ANT_COLOR = '#00a6a6';
  var DEBUG_CONES = false;

  // same blue detection as love.js
  function isTrailPixel(r, g, b) {
    return g > r + 15 && b > r + 15 && r < 245;
  }

  function detectTrail(bot) {
    var h = bot.heading;
    var cx = bot.x * scale, cy = bot.y * scale;
    var searchR = SEARCH_RANGE * scale;

    var bx = Math.max(0, Math.floor(cx - searchR));
    var by = Math.max(0, Math.floor(cy - searchR));
    var bw = Math.min(Math.ceil(searchR * 2) + 1, trailCanvas.width - bx);
    var bh = Math.min(Math.ceil(searchR * 2) + 1, trailCanvas.height - by);
    if (bw <= 0 || bh <= 0) return null;

    var imageData = trailCtx.getImageData(bx, by, bw, bh);
    var data = imageData.data;

    var sumDx = 0, sumDy = 0, totalWeight = 0;

    for (var gy = 0; gy < bh; gy += SCAN_STEP) {
      for (var gx = 0; gx < bw; gx += SCAN_STEP) {
        var px = bx + gx, py = by + gy;
        var dx = px - cx, dy = py - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > searchR || dist < 3) continue;

        var angle = Math.atan2(dy, dx);
        var ad = angle - h;
        while (ad >  Math.PI) ad -= Math.PI * 2;
        while (ad < -Math.PI) ad += Math.PI * 2;
        if (Math.abs(ad) > SEARCH_HALF) continue;

        var idx = (gy * bw + gx) * 4;
        if (isTrailPixel(data[idx], data[idx + 1], data[idx + 2])) {
          var weight = 1 - (dist / searchR);
          sumDx += dx * weight;
          sumDy += dy * weight;
          totalWeight += weight;
        }
      }
    }

    if (totalWeight === 0) return null;
    return Math.atan2(sumDy / totalWeight, sumDx / totalWeight);
  }

  function findNearestAhead(bot) {
    var bestDist = NEARBY_RANGE;
    var bestBot = null;

    for (var i = 0; i < bots.length; i++) {
      var other = bots[i];
      if (other === bot || !other.alive) continue;
      if (other.scenario !== Scenarios['death-spiral']) continue;

      var dx = other.x - bot.x;
      var dy = other.y - bot.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= bestDist) continue;

      var angle = Math.atan2(dy, dx);
      var ad = angle - bot.heading;
      while (ad >  Math.PI) ad -= Math.PI * 2;
      while (ad < -Math.PI) ad += Math.PI * 2;
      if (Math.abs(ad) > Math.PI / 2) continue;

      bestDist = dist;
      bestBot = other;
    }
    return bestBot;
  }

  Scenarios['death-spiral'] = {
    name: 'Death Spiral',

    spawn: function (spawnFn, opts) {
      for (var i = 0; i < ANT_COUNT; i++) {
        spawnFn({ ...opts, color: { str: ANT_COLOR } });
      }
    },

    init: function (bot) {
      bot.seed  = Math.floor(Math.random() * 999999);
      bot.noise = SimplexNoise.create(bot.seed);
      bot.t     = Math.random() * 10000;
    },

    steer: function (bot) {
      bot.t += bot.wiggle;
      var n = bot.noise(bot.t, bot.seed);
      var baseTurn = n * bot.maxTurnDeg * (Math.PI / 180);
      var maxSteer = bot.maxTurnDeg * (Math.PI / 180);

      // priority 1: follow nearest ant ahead when close
      var ahead = findNearestAhead(bot);
      if (ahead) {
        var dx = ahead.x - bot.x;
        var dy = ahead.y - bot.y;
        var targetAngle = Math.atan2(dy, dx);
        var diff = targetAngle - bot.heading;
        while (diff >  Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        var steer = diff * NEARBY_STRENGTH + baseTurn * 0.1;
        return Math.max(-maxSteer, Math.min(maxSteer, steer));
      }

      // priority 2: follow pheromone trail
      var trailAngle = detectTrail(bot);
      if (trailAngle !== null) {
        var diff = trailAngle - bot.heading;
        while (diff >  Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        var steer = diff * FOLLOW_STRENGTH + baseTurn * 0.15;
        return Math.max(-maxSteer, Math.min(maxSteer, steer));
      }

      return baseTurn;
    },

    avoidEdges: function (bot) {
      var dL = bot.x, dR = WORLD_W - bot.x;
      var dT = bot.y, dB = WORLD_H - bot.y;

      var repX = 0, repY = 0;
      if (dL < CONE_RANGE) repX += 1 - dL / CONE_RANGE;
      if (dR < CONE_RANGE) repX -= 1 - dR / CONE_RANGE;
      if (dT < CONE_RANGE) repY += 1 - dT / CONE_RANGE;
      if (dB < CONE_RANGE) repY -= 1 - dB / CONE_RANGE;

      if (repX === 0 && repY === 0) return 0;

      var awayAngle = Math.atan2(repY, repX);
      var diff = awayAngle - bot.heading;
      while (diff >  Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      var urgency  = Math.min(1, Math.sqrt(repX * repX + repY * repY));
      var maxSteer = bot.maxTurnDeg * (Math.PI / 180);
      return Math.max(-maxSteer * 3, Math.min(maxSteer * 3, diff * urgency * 2));
    },

    drawOverlay: function (bot, ctx, noseX, noseY) {
      if (!DEBUG_CONES) return;

      var h = bot.heading;
      var searchR = SEARCH_RANGE * scale;
      ctx.fillStyle   = 'rgba(0, 166, 166, 0.06)';
      ctx.strokeStyle = 'rgba(0, 166, 166, 0.2)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(noseX, noseY);
      ctx.arc(noseX, noseY, searchR, h - SEARCH_HALF, h + SEARCH_HALF);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  };
})();

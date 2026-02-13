// Scenario 2: Love
// One red bot and one blue bot. They wander until they detect the other's
// trail, then weave alongside it. Once close enough, they follow each other.

(function () {
  var SEARCH_RANGE = 8;     // inches — trail detection range
  var SEARCH_HALF_DEG = 70;
  var SEARCH_HALF = SEARCH_HALF_DEG * (Math.PI / 180);
  var SCAN_STEP = 3;
  var ATTRACT = 0.06;       // pull toward trail/other bot
  var WEAVE_AMP = 0.1;      // radians — how far the weave swings side to side
  var WEAVE_SPEED = 1.5;    // how fast the weave oscillates (multiplier on bot.t)
  var FOLLOW_RANGE = 5;     // inches — when this close, follow the other bot directly

  function isRedPixel(r, g, b) {
    return r > g + 15 && r > b + 10 && g < 245 && b < 245;
  }

  function isBluePixel(r, g, b) {
    return g > r + 15 && b > r + 15 && r < 245;
  }

  function detectTrail(bot) {
    var isRed = bot.color.str === '#d64550';
    var matchFn = isRed ? isBluePixel : isRedPixel;

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
        if (matchFn(data[idx], data[idx + 1], data[idx + 2])) {
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

  // find the other Love bot with the opposite color
  function findMate(bot) {
    var oppositeColor = bot.color.str === '#d64550' ? '#00a6a6' : '#d64550';
    for (var i = 0; i < bots.length; i++) {
      var other = bots[i];
      if (other !== bot && other.alive && other.color.str === oppositeColor &&
          other.scenario === Scenarios['love']) {
        return other;
      }
    }
    return null;
  }

  // compute steering toward a target angle with organic weaving
  function steerWithWeave(bot, targetAngle) {
    var diff = targetAngle - bot.heading;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    // perpendicular weave using noise — organic oscillation, not mechanical
    var weave = bot.noise(bot.t * WEAVE_SPEED, bot.seed + 777) * WEAVE_AMP;

    var maxSteer = bot.maxTurnDeg * (Math.PI / 180);
    var steer = diff * ATTRACT + weave;
    return Math.max(-maxSteer, Math.min(maxSteer, steer));
  }

  Scenarios['love'] = {
    name: 'Love',

    spawn: function (spawnFn, opts) {
      spawnFn({ ...opts, color: { str: '#d64550' } });
      spawnFn({ ...opts, color: { str: '#00a6a6' } });
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

      // priority 1: follow the other bot directly when close
      var mate = findMate(bot);
      if (mate) {
        var dx = mate.x - bot.x;
        var dy = mate.y - bot.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < FOLLOW_RANGE) {
          var mateAngle = Math.atan2(dy, dx);
          return steerWithWeave(bot, mateAngle);
        }
      }

      // priority 2: follow opposite color trail — replace wander with weave
      var trailAngle = detectTrail(bot);
      if (trailAngle !== null) {
        return steerWithWeave(bot, trailAngle);
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
      // small avoidance cone
      var coneR = CONE_RANGE * scale;
      ctx.fillStyle   = 'rgba(255, 220, 0, 0.12)';
      ctx.strokeStyle = 'rgba(255, 200, 0, 0.3)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(noseX, noseY);
      ctx.arc(noseX, noseY, coneR, bot.heading - CONE_HALF, bot.heading + CONE_HALF);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // larger search cone tinted toward the sought color
      var isRed = bot.color.str === '#d64550';
      var searchR = SEARCH_RANGE * scale;
      ctx.fillStyle   = isRed ? 'rgba(0, 166, 166, 0.03)' : 'rgba(214, 69, 80, 0.03)';
      ctx.strokeStyle = isRed ? 'rgba(0, 166, 166, 0.12)' : 'rgba(214, 69, 80, 0.12)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(noseX, noseY);
      ctx.arc(noseX, noseY, searchR, bot.heading - SEARCH_HALF, bot.heading + SEARCH_HALF);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  };
})();

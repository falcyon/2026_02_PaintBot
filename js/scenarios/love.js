// Scenario 2: Love
// One red bot and one blue bot. They wander aimlessly until they detect
// the other's trail color inside a wide search cone, then they steer
// toward it.

(function () {
  // #d64550 → R=214, G=69, B=80   |   #00a6a6 → R=0, G=166, B=166
  var SEARCH_RANGE = 8;     // inches — wide search area
  var SEARCH_HALF_DEG = 70; // degrees — broad forward arc
  var SEARCH_HALF = SEARCH_HALF_DEG * (Math.PI / 180);
  var SCAN_STEP = 3;        // pixels between grid samples
  var ATTRACT = 0.8;        // steering strength toward detected trail

  function isRedPixel(r, g, b) {
    // red trail on white canvas: R high, G and B much lower
    return r > g + 15 && r > b + 10 && g < 245 && b < 245;
  }

  function isBluePixel(r, g, b) {
    // blue trail on white canvas: G and B similar, R much lower
    return g > r + 15 && b > r + 15 && r < 245;
  }

  function detectTrail(bot) {
    var isRed = bot.color.str === '#d64550';
    var matchFn = isRed ? isBluePixel : isRedPixel;

    var h = bot.heading;
    var cx = bot.x * scale, cy = bot.y * scale;
    var searchR = SEARCH_RANGE * scale;

    // bounding box of search area on the trail canvas
    var bx = Math.max(0, Math.floor(cx - searchR));
    var by = Math.max(0, Math.floor(cy - searchR));
    var bw = Math.min(Math.ceil(searchR * 2) + 1, trailCanvas.width - bx);
    var bh = Math.min(Math.ceil(searchR * 2) + 1, trailCanvas.height - by);
    if (bw <= 0 || bh <= 0) return null;

    var imageData = trailCtx.getImageData(bx, by, bw, bh);
    var data = imageData.data;

    // grid scan: check every SCAN_STEP-th pixel in the bounding box
    var sumDx = 0, sumDy = 0, totalWeight = 0;

    for (var gy = 0; gy < bh; gy += SCAN_STEP) {
      for (var gx = 0; gx < bw; gx += SCAN_STEP) {
        // world-pixel position of this sample
        var px = bx + gx, py = by + gy;
        var dx = px - cx, dy = py - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > searchR || dist < 3) continue;

        // is this sample inside the forward cone?
        var angle = Math.atan2(dy, dx);
        var ad = angle - h;
        while (ad >  Math.PI) ad -= Math.PI * 2;
        while (ad < -Math.PI) ad += Math.PI * 2;
        if (Math.abs(ad) > SEARCH_HALF) continue;

        // check pixel color
        var idx = (gy * bw + gx) * 4;
        if (matchFn(data[idx], data[idx + 1], data[idx + 2])) {
          var weight = 1 - (dist / searchR); // closer = stronger pull
          sumDx += dx * weight;
          sumDy += dy * weight;
          totalWeight += weight;
        }
      }
    }

    if (totalWeight === 0) return null;
    return Math.atan2(sumDy / totalWeight, sumDx / totalWeight);
  }

  Scenarios['love'] = {
    name: 'Love',

    // spawns a red+blue pair instead of a single bot
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
      // base noise wandering (same as Aimless)
      bot.t += bot.wiggle;
      var n = bot.noise(bot.t, bot.seed);
      var turn = n * bot.maxTurnDeg * (Math.PI / 180);

      // check for opposite color trail in search cone
      var targetAngle = detectTrail(bot);
      if (targetAngle !== null) {
        var diff = targetAngle - bot.heading;
        while (diff >  Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        turn += diff * ATTRACT;
      }

      return turn;
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
      // small avoidance cone (same yellow as Aimless)
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

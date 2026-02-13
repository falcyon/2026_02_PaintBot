// Scenario 1: Aimless
// Bots wander using simplex noise for smooth random steering,
// with wall-distance repulsion for edge avoidance.

(function () {
  Scenarios['aimless'] = {
    name: 'Aimless',

    spawn: function (spawnFn, opts) {
      for (var i = 0; i < 5; i++) spawnFn(opts);
    },

    init: function (bot) {
      bot.seed  = Math.floor(Math.random() * 999999);
      bot.noise = SimplexNoise.create(bot.seed);
      bot.t     = Math.random() * 10000;
    },

    steer: function (bot) {
      bot.t += bot.wiggle;
      var n = bot.noise(bot.t, bot.seed);
      return n * bot.maxTurnDeg * (Math.PI / 180);
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
    }
  };
})();

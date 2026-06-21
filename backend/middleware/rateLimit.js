function createRateLimit({ windowMs = 60_000, limit = 120, message = 'Too many requests. Please try again shortly.' } = {}) {
  const clients = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of clients) if (entry.resetAt <= now) clients.delete(key);
  }, windowMs);
  cleanup.unref?.();

  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = clients.get(key);
    if (!entry || entry.resetAt <= now) entry = { count: 0, resetAt: now + windowMs };
    entry.count += 1;
    clients.set(key, entry);
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - entry.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
    if (entry.count > limit) return res.status(429).json({ error: message, code: 'RATE_LIMITED' });
    next();
  };
}

module.exports = { createRateLimit };

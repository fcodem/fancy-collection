/**
 * Keep `npm ci` deterministic in CI and fresh clones.
 *
 * Production uses the explicitly traced @sparticuz/chromium package. Local PDF
 * rendering resolves an installed Chrome/Edge binary before falling back to the
 * optional Puppeteer browser. Downloading a second ~300 MB browser during every
 * install is therefore unnecessary and can fail on partial/shared caches.
 */
module.exports = {
  skipDownload: true,
};

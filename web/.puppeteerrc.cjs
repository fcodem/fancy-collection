/**
 * Keep `npm ci` deterministic in CI and fresh clones.
 *
 * Production uses the explicitly traced @sparticuz/chromium package. Local PDF
 * rendering uses puppeteer-core with an installed Chrome/Edge binary. Never
 * download a second ~300 MB browser during install.
 */
module.exports = {
  skipDownload: true,
};

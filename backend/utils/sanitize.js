const path = require('path');

function sanitizeFilename(filename) {
  // Remove or replace invalid characters
  filename = filename.replace(/[<>:"/\\|?*]/g, '_');
  // Remove control characters
  filename = filename.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
  // Limit length
  if (filename.length > 200) {
    const ext = path.extname(filename);
    const name = path.basename(filename, ext);
    filename = name.substring(0, 200 - ext.length) + ext;
  }
  return filename.trim();
}

module.exports = { sanitizeFilename };

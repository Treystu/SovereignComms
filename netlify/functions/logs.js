const fs = require('fs/promises');

// Simple Netlify function that stores POSTed log data on the temp filesystem.
// In a real deployment this could forward the logs to an external service or
// email address instead.
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const body = event.body || '';
    // Write the body to a temporary file so it can be inspected later.
    const file = `/tmp/log-${Date.now()}.txt`;
    await fs.writeFile(file, body, 'utf8');
    console.log('Stored logs at', file);
    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.error('Failed to store logs', err);
    return { statusCode: 500, body: String(err) };
  }
};

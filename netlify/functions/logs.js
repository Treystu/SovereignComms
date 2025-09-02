exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    // Simply log the first part of the body; a real implementation could
    // persist this to storage or forward to a logging service.
    const snippet = (event.body || '').slice(0, 1000);
    console.log('Received logs', snippet);
    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    return { statusCode: 500, body: String(err) };
  }
};

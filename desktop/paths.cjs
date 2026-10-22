const path = require('node:path');

const APP_ORIGIN = 'anduo://app';

function resourcePath(root, requestUrl) {
  const url = new URL(requestUrl);
  if (url.protocol !== 'anduo:' || url.host !== 'app') throw new Error('Invalid application origin');
  const name = decodeURIComponent(url.pathname);
  if (name.includes('\0') || name.includes('\\')) throw new Error('Invalid resource path');
  const target = path.resolve(root, `.${name === '/' ? '/index.html' : name}`);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid resource path');
  return target;
}

module.exports = { APP_ORIGIN, resourcePath };
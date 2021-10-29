const axios = require('axios');
const { getPluginOptions } = require('../options');
const { queryDominantColor } = require('../download');

const base64Cache = {};

// Create Cloudinary image URL with transformations.
exports.getImageURL = ({
  public_id,
  cloudName,
  transformations = [],
  chained = [],
  version = false,
  format = false
}) => {
  const baseURL = 'https://res.cloudinary.com/';

  const defaultTransformations = getPluginOptions().enableDefaultTransformations
    ? ['f_auto', 'q_auto']
    : [];
  const initialTransformations = transformations
    .concat(defaultTransformations)
    .join(',');
  const allTransformations = [initialTransformations].concat(chained).join('/');

  const imagePath = [
    cloudName,
    '/image/upload/',
    allTransformations,
    version ? `/v${version}/` : '/',
    public_id,
    format ? `.${format}` : ''
  ]
    .join('')
    .replace('//', '/');

  return baseURL + imagePath;
};

// Retrieve aspect ratio if in transformation else create aspect ratio values
exports.getAspectRatio = (transformations, originalAspectRatio) => {
  const arTransform = transformations.find(t => t.startsWith('ar_'));
  if (!arTransform) {
    return originalAspectRatio;
  }

  const newAspectRatio = arTransform.replace('ar_', '');
  if (newAspectRatio.indexOf(':') === -1) {
    return Number(newAspectRatio);
  }

  const [w, h] = newAspectRatio.split(':').map(Number);

  return w / h;
};

exports.getTracedSVG = async ({
  chained,
  cloudName,
  public_id,
  transformations = [],
  colors = 5,
  detail = 0.1,
  version
}) => {

  const tracedSVGURL = exports.getImageURL({
    transformations: transformations.concat(`e_vectorize:colors:${colors}:detail:${detail}`),
    public_id,
    version,
    cloudName,
    chained,
    format: 'svg'
  });
  const base64 = await fetchBase64(tracedSVGURL, 'svg+xml'); //, reporter);

  return base64;
}

exports.getBase64 = async ({
  base64Width,
  chained,
  cloudName,
  public_id,
  //reporter,
  transformations = [],
  version,
}) => {

  const b64Transformations = [...transformations];
  b64Transformations.push(`w_${base64Width}`);
  const base64URL = exports.getImageURL({
    transformations: b64Transformations,
    public_id,
    version,
    cloudName,
    chained,
  });
  const base64 = await fetchBase64(base64URL, 'jpeg'); //, reporter);

  return base64;
};

async function fetchBase64(url, format) { //}, reporter) {
  if (!base64Cache[url]) {
    logBase64Retrieval(url); //, reporter);
    base64Cache[url] = axios.get(url, { responseType: 'arraybuffer' });
  }
  const response = await base64Cache[url];
  const data = Buffer.from(response.data).toString('base64');
  return `data:image/${format};base64,${data}`;
}

let fetchedBase64ImageCount = 0;

function logBase64Retrieval(url) { //, reporter) {
  fetchedBase64ImageCount += 1;
  if (typeof console.log === 'function') {
    console.log(
      `[gatsby-transformer-cloudinary] Fetching base64 image ` +
        `#${fetchedBase64ImageCount} from Cloudinary: ${url}`,
    );
    if (fetchedBase64ImageCount == 100) {
      console.log(
        '[gatsby-transformer-cloudinary] ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
      );
      console.log(
        'It looks like your project has a lot of images. To improve your build times, ',
      );
      console.log(
        'you should consider (1) using images that are already on Cloudinary, (2) ',
      );
      console.log(
        'precomputing the base64 images and providing them to this plugin as the ',
      );
      console.log(
        '`defaultBase64` property, and (3) setting the plugin option ',
      );
      console.log(
        '`alwaysUseDefaultBase64` to true. Doing so will reduce the number of base64 ',
      );
      console.log(
        'images that need to be fetched from Cloudinary and speed up your Gatsby "query" ',
      );
      console.log(
        'build steps. (See the section "Use images already on Cloudinary" in the README.)',
      );
      console.log(
        '[gatsby-transformer-cloudinary] ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
      );
    }
  }
}

exports.getDominantColor = async ({
  public_id
}) => {
  return await queryDominantColor(public_id);
}
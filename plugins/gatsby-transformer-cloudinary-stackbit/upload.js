const cloudinary = require('cloudinary').v2;
const { getPluginOptions } = require('./options');

let totalImages = 0;
let uploadedImages = 0;

const FIVE_MINUTES = 5 * 60 * 1000;

exports.getAllTransformations = async (
  reporter
) => {
  exports.verifyRequiredOptions(reporter);
  const {
    apiKey,
    apiSecret,
    cloudName
  } = getPluginOptions();

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });

  try {
    return await cloudinary.api.transformations({max_results: 500, named: true});
  } catch (error) {
    reporter.panic('An error occurred: '+JSON.stringify(error));
  }
}

exports.updateNamedTransformation = async (
  name,
  transformations,
  reporter
) => {
  exports.verifyRequiredOptions(reporter);
  const {
    apiKey,
    apiSecret,
    cloudName
  } = getPluginOptions();

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });

  try {
    await cloudinary.api.update_transformation(name, transformations);
  } catch (error) {
    reporter.panic('An error occurred: '+JSON.stringify(error));
  }
}

exports.createNamedTransformation = async (
  name,
  transformations,
  reporter
) => {
  exports.verifyRequiredOptions(reporter);
  const {
    apiKey,
    apiSecret,
    cloudName
  } = getPluginOptions();

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });

  try {
    await cloudinary.api.create_transformation(name, transformations);
  } catch (error) {
    reporter.panic('An error occurred: '+JSON.stringify(error));
  }
}

exports.uploadImageToCloudinary = async ({
  url,
  publicId,
  overwrite,
  reporter,
}) => {
  exports.verifyRequiredOptions(reporter);
  const {
    apiKey,
    apiSecret,
    breakpointsMaxImages,
    cloudName,
    createDerived,
    maxWidth,
    minWidth,
    uploadFolder,
    useCloudinaryBreakpoints,
  } = getPluginOptions();
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });

  const uploadOptions = {
    folder: uploadFolder,
    overwrite,
    public_id: publicId,
    resource_type: 'auto',
    timeout: FIVE_MINUTES,
  };

  // Each time we ask Cloudinary to calculate the responsive breakpoints for an
  // image, Cloudinary bills us for one transformation. Since this API call
  // gets called for every image every time our Gatsby cache gets cleared, this
  // can get expensive very fast. This option should not be used outside of
  // production. It's recommended that createDerived be set to true when
  // useCloudinaryBreakpoints is set to true.This will store the derived images
  // and prevent Cloudinary from using more transformations to recompute them
  // in the future.
  if (useCloudinaryBreakpoints) {
    uploadOptions.responsive_breakpoints = [
      {
        create_derived: createDerived,
        bytes_step: 20000,
        min_width: minWidth,
        max_width: maxWidth,
        max_images: breakpointsMaxImages,
      },
    ];
  }

  let attempts = 1;

  totalImages++;

  while (true) {
    try {
      const result = await cloudinary.uploader.upload(url, uploadOptions);
      uploadedImages++;
      if (
        uploadedImages == totalImages ||
        uploadedImages % Math.ceil(totalImages / 100) == 0
      )
        reporter.info(
          `[gatsby-transformer-cloudinary] Uploaded ${uploadedImages} of ${totalImages} images to Cloudinary. (${Math.round(
            (100 * uploadedImages) / totalImages,
          )}%)`,
        );
      return result;
    } catch (error) {
      const stringifiedError = JSON.stringify(error, null, 2);
      if (attempts < 3) {
        attempts += 1;
        reporter.warn(
          `An error occurred when uploading ${url} to Cloudinary: ${stringifiedError}`,
        );
      } else {
        reporter.panic(
          `Unable to upload ${url} to Cloudinary after ${attempts} attempts: ${stringifiedError}`,
        );
      }
    }
  }
};

exports.uploadImageNodeToCloudinary = async ({ node, reporter }) => {
  const url = node.absolutePath;
  const relativePathWithoutExtension = node.relativePath.replace(
    /\.[^.]*$/,
    '',
  );
  const publicId = relativePathWithoutExtension;
  const overwrite = getPluginOptions().overwriteExisting;
  const result = await exports.uploadImageToCloudinary({
    url,
    publicId,
    overwrite,
    reporter,
  });
  return result;
};

exports.verifyRequiredOptions = (reporter) => {
  const requiredOptions = ['apiKey', 'apiSecret', 'cloudName'];
  const pluginOptions = getPluginOptions();
  requiredOptions.forEach(optionKey => {
    if (pluginOptions[optionKey] == null) {
      reporter.panic(
        `[gatsby-transformer-cloudinary] "${optionKey}" is a required plugin option. You can add it to the options object for "gatsby-transformer-cloudinary" in your gatsby-config file.`,
      );
    }
  });
}
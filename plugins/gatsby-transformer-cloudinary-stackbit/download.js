const axios = require('axios');
const fs = require('fs-extra');

const tar = require('tar');

const path = require('path');
const cloudinary = require('cloudinary').v2;
const { getPluginOptions } = require('./options');

const { verifyRequiredOptions } = require('./upload');

const stream = require ('stream');
const { promisify } = require('util');

const cloudinaryResources = async(folder, type, opts) => {
  return new Promise((resolve, reject) => {
    cloudinary.api.resources({prefix: folder, resource_type: 'image', type: type, metadata: true, ...opts }, (error, response) => {
      if (error) return reject(error);
      else return resolve(response);
    });
  });
}

exports.getAllCloudinaryImages = async(reporter, next_cursor) => {
    const {
        apiKey,
        apiSecret,
        cloudName,
        uploadFolder
    } = getPluginOptions();

    reporter.verbose ("Getting all cloudinary images");

    verifyRequiredOptions(reporter);

    cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
    });

    let options = { max_results: 500 }
    if (next_cursor) options.next_cursor = next_cursor;

    try {
      return await cloudinaryResources(uploadFolder, 'upload', options);
    }
    catch (error) {
        reporter.error(`Got an error attempting to fetch all Cloudinary images in ${uploadFolder}. Error is: `+JSON.stringify(error));
    }
}

const fetchArchiveURL = (transformations, reporter) => {
  const {
    apiKey,
    apiSecret,
    cloudName,
    uploadFolder
  } = getPluginOptions();

  verifyRequiredOptions(reporter);

  cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
  });

  return cloudinary.utils.download_folder(uploadFolder, 
    { 
      target_public_id: 'images', 
      resource_type: 'image', 
      type: 'upload', 
      transformations: transformations, 
      target_format: "tgz",
      keep_derived: true
    }, (err, url) => {
    if (err) {
      reporter.panic(`Something went wrong:`+JSON.stringify(err));
      return undefined;
    }
    reporter.verbose(`Got the URL: ${url}`);
    return url;
  });
}

const finished = promisify(stream.finished);
const downloadZip = async (fileUrl, outputLocationPath, reporter) => {
  const writer = fs.createWriteStream(outputLocationPath);
  reporter.verbose(`Downloading file: ${fileUrl}`);
  return axios({
    method: 'get',
    url: fileUrl,
    responseType: 'stream',
  }).then(async response => {
    response.data.pipe(writer);
    return finished(writer);
  });
}

exports.downloadArchive = async(downloadFolder, options, reporter) => {

  const {transformations} = options;

  const url = fetchArchiveURL(transformations, reporter);
  if(!url) reporter.panic("Archive URL is undefined");

  const fileName = 'images.tar.gz';
  const dir = path.resolve(__dirname, downloadFolder);
  const localFilePath = path.resolve(__dirname, downloadFolder, fileName);

  fs.ensureDir(dir);
  reporter.info("Downloading all Cloudinary images - this may take some time");
  await downloadZip(url, localFilePath, reporter)
  
  reporter.info("Extracting archive to image folder");
  await fs.createReadStream(localFilePath).pipe(
    tar.x({
      C: downloadFolder,
      gzip: true,
      strip: 1
    })
  );

  //logging for debugging in stackbit
  const files = await fs.readdir(downloadFolder);
  reporter.info(`Got the files in ${downloadFolder}: `+JSON.stringify(files))
}

exports.downloadFile = async (fileUrl, downloadFolder, reporter) => {

    reporter.info(`Attempting to download ${fileUrl}`);

    // Get the file name
    const fileName = path.basename(fileUrl);
    const dir = path.resolve(__dirname, downloadFolder);

    try {
      fs.ensureDir(dir);
  
      // The path of the downloaded file on our machine
      const localFilePath = path.resolve(__dirname, downloadFolder, fileName);

      const response = await axios({
        method: 'GET',
        url: fileUrl,
        responseType: 'stream',
      });

      //do some logging to see if we can get the eTag
      reporter.verbose('Download Response' + JSON.stringify(response.headers));
  
      const w = response.data.pipe(fs.createWriteStream(localFilePath));
      w.on('finish', () => {
        reporter.info(`Successfully downloaded file ${localFilePath}`);
      });

      return response.headers;

    } catch (err) {
      reporter.error(`Got an error attempting to fetch file ${fileUrl}. Error is: `+JSON.stringify(err));
    }
  };

  
exports.queryDominantColor = async (public_id) => {

    const {
      apiKey,
      apiSecret,
      cloudName,
    } = getPluginOptions();
  
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });

    var color = "#fff";
  
    try {
      const result = await cloudinary.api.resource(public_id, { colors: true });
      //console.log(result);
    
      if (result.colors && result.colors.length > 1) {
  
        color = result.colors[0,0];
      }
    } catch (error ) {
        console.log('Error fetching dominant colour', error);
    } finally {
      return color;
    }
  }
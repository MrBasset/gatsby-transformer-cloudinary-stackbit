const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { getPluginOptions } = require('./options');

exports.getAllCloudinaryImages = async(reporter) => {
    const {
        apiKey,
        apiSecret,
        cloudName,
        uploadFolder
    } = getPluginOptions();

    cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
    });

    try {
        return await cloudinary.api.resources({ prefix: uploadFolder, resource_type: 'image', type: 'upload' });
    }
    catch (error) {
        reporter.error(error);
    }
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
  
      const w = response.data.pipe(fs.createWriteStream(localFilePath));
      w.on('finish', () => {
        reporter.info(`Successfully downloaded file ${localFilePath}`);
      });
    } catch (err) {
      reporter.error(err);
    }
  }; 
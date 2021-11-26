const { syncDown, authenticate, watch } = require('./google/sync');

exports.onPreInit = async ({emitter, reporter}, pluginOptions) => {
  const {
    localCachePath,
    remoteDirectory,
    email,
    key
  } = pluginOptions;
  
  const keyfile = {
    client_email: email,
    private_key: key
  };

  //sync from google to pull down the remote content locally - the assumption is that the cache will be empty and so we just pull in what is there
  reporter.info('Pulling down cache from Google');
  await authenticate(keyfile, reporter);
  const folderId = await syncDown(localCachePath, remoteDirectory, reporter);

  //set up a file watcher to keep the cache in sync, pushing local files up to google.
  watch(emitter, localCachePath, remoteDirectory, folderId, reporter, pluginOptions);
}

exports.pluginOptionsSchema = ({ Joi }) => {
  return Joi.object({
    localCachePath:     Joi.string()
                           .required(),
    remoteDirectory:    Joi.string()
                           .required(),
    email:              Joi.string()
                           .required(),
    key:                Joi.string()
                           .required()
  })
}
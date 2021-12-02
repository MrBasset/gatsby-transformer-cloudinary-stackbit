const { syncDown, authenticate, watch, CACHE_TAR, PUBLIC_TAR } = require('./google/sync');

exports.onPreInit = async ({emitter, reporter}, pluginOptions) => {
  const {
    localCachePath = ".cache",
    localPublicPath = "public",
    remoteDirectory = "gatsby",
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
  const { cacheFolderId, cacheFileId } = await syncDown(localCachePath, CACHE_TAR, remoteDirectory, reporter);
  const { publicFolderId, publicFileId } = await syncDown(localPublicPath, PUBLIC_TAR, remoteDirectory, reporter);

  if (cacheFolderId !== publicFolderId) reporter.panic(`Remote folder error, ${cacheFolderId} !== ${publicFolderId}`)

  reporter.info(`Got the folderId ${cacheFolderId} and the cacheFileId ${cacheFileId} and the publicFileId ${publicFileId}.`);

  //set up a file watcher to keep the cache in sync, pushing local files up to google.
  watch(emitter, { 
    localCachePath,
    localPublicPath,
    remoteDirectory, 
    folderId: cacheFolderId, 
    cacheFileId,
    publicFileId },
    reporter, pluginOptions);
}

exports.pluginOptionsSchema = ({ Joi }) => {
  return Joi.object({
    localCachePath:     Joi.string()
                           .required(),
    localPublicPath:    Joi.string()
                           .required(),
    remoteDirectory:    Joi.string()
                           .required(),
    email:              Joi.string()
                           .required(),
    key:                Joi.string()
                           .required()
  })
}
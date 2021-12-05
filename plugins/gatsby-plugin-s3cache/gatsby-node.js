const { syncDown, authenticate, watch, CACHE_TAR, PUBLIC_TAR } = require('./s3/sync');

exports.onPreInit = async ({emitter, reporter}, pluginOptions) => {
  const {
    localCachePath = `${process.cwd()}/.cache`,
    localPublicPath = `${process.cwd()}/public`,
    bucket,
    key,
    secret,
    region
  } = pluginOptions;
  


  //sync from google to pull down the remote content locally - the assumption is that the cache will be empty and so we just pull in what is there
  reporter.info('Pulling down cache from S3');
  const client = authenticate({key, secret, region}, reporter);

  await syncDown(client, localCachePath, `s3://${bucket}/.cache`, reporter);
  await syncDown(client, localPublicPath, `s3://${bucket}/public`, reporter);



  //set up a file watcher to keep the cache in sync, pushing local files up to google.
  watch(client, emitter, pluginOptions, reporter);
}

exports.pluginOptionsSchema = ({ Joi }) => {
  return Joi.object({
    localCachePath:     Joi.string()
                           .required(),
    localPublicPath:    Joi.string()
                           .required(),
    bucket:             Joi.string()
                           .required(),
    key:                Joi.string()
                           .required(),
    secret:             Joi.string()
                           .required(),
    region:             Joi.string()
                           .required(), 
  })
}
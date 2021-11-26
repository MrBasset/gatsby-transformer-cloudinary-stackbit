const chokidar = require(`chokidar`);
const { createMachine, interpret } = require(`xstate`);
const fs = require('fs-extra');
const path = require('path');
const { google } = require('googleapis');
const mime = require('mime-types');

const tar = require('tar');

const _ = require('lodash');

const CACHE_TAR = `cache.tar.gz`

const downloadAndExtractTar = async (file, destFolder, reporter) => {
    const filePath = path.join(process.cwd(), file.name);

    reporter.info(`Downloading file to ${filePath}`);

    const dest = fs.createWriteStream(filePath);

    let fileId = file.id;
    if (file.shortcutDetails) {
        fileId = file.shortcutDetails.targetId;
    }

    const response = await drive.files.get({
        fileId: fileId,
        alt: 'media'
    }, {
        responseType: 'stream'
    });

    return new Promise((resolve, reject) => {
        reporter.info('Writing stream to disk');
        response.data
            .on('error', (error) => {
                console.log(error);
                reporter.error(`Error ocurred writing to the disk`+JSON.stringify(error));
                reject(error);
            })
            .pipe(dest)
            .on('error',  (error) => {
                console.log(error);
                reporter.error(`Error ocurred writing to the disk`+JSON.stringify(error));
                reject(error);
            })
            .on('finish', async () => {
                reporter.info('Written stream to disk');
                await fs.createReadStream(filePath).pipe(
                    tar.x({
                      C: destFolder,
                      gzip: true,
                      strip: 1
                    })
                );

                

                //logging for debugging in stackbit
                const files = await fs.readdir(destFolder);
                reporter.info(`Got the files in ${destFolder}: `+JSON.stringify(files))

                resolve({
                    file: filePath,
                    fileId: fileId,

                    updated: true
                });
            });
    });
}

const listFolder = async (folderId, reporter) => {
    try {
        reporter.info(`Listing contents for folder Id ${folderId}`);
        const response = await drive.files.list({
            q: `'${folderId}' in parents`,
            fields: 'files(id, name)'
        });

        reporter.info(`Got the list of files: `+JSON.stringify(response.data));

        reporter.info(`Test output is data: ${!!response.data}, files ${!!response.data.files}, and length ${response.data.files.length > 0}`);

        if ( !!response.data && !!response.data.files && response.data.files.length > 0) {
            return response.data.files;
        }
        return null;
    } catch (error) {
        reporter.info(JSON.stringify(error));
        reporter.panic(`Unable to find folder '${name}'`);
    }
}

// Returns the first match to our folder - in this case there should only be one.
const findFileOrFolder = async (pathType, name, parentId = null, reporter) => {
    try {
        reporter.info(`Looking for ${name} with parent Id: ${parentId}`);
        let query = `mimeType ${pathType === 'directory' ? '=' : '!='} 'application/vnd.google-apps.folder' and name = '${name}'`;
        if (!!parentId) query += ` and '${parentId}' in parents`;

        reporter.info(`Query is ${query}`);

        const response = await drive.files.list({
            q: query,
            fields: 'files(id, name, parents)'
        });

        reporter.info(`Got the list of files: `+JSON.stringify(response.data));

        reporter.info(`Test output is data: ${!!response.data}, files ${!!response.data.files}, and length ${response.data.files.length > 0}`);

        if ( !!response.data && !!response.data.files && response.data.files.length > 0) {
            reporter.info(`Returning the file: `+JSON.stringify(response.data.files[0]));
            return response.data.files[0];
        }

        return null;

    } catch (error) {
        reporter.info(JSON.stringify(error));
        reporter.panic(`Unable to find folder '${name}'`);
    }
}

const deleteFileOrFolder = async (pathType, path, reporter) => {
    try {
        //find file first and then delete
        const fileId = await findFileOrFolder(pathType, path, reporter);

        if(!fileId) {
            reporter.warn(`Unable to find remote instance of file to delete: ${path}`);
        }

        const response = await drive.files.delete({
            fileId: fileId,
        });
        reporter.info(`${response.data}, ${response.status}`);
    } catch (error) {
        reporter.error(`${error.message}`);
    }
}

const createFolder = async (name, reporter) => {
    // try to create the folder, fail gracefully if the folder already exists.
    try {
        var fileMetadata = {
            'name': name,
            'mimeType': 'application/vnd.google-apps.folder'
        };
        const response = await drive.files.create({
            resource: fileMetadata,
            fields: 'id'
        })

        reporter.info(`Apparently we've created the folder:`+JSON.stringify(response));

        return response.data;

    } catch (error) {
        reporter.info(`${fileId} already exists`);
        reporter.info(JSON.stringify(error));
    }
}

const uploadFile = async (localPath, remotePath, folderId, reporter) => {
    try {
        reporter.info(`uploading file ${localPath} to ${remotePath}`);

        const fileSize = fs.statSync(localPath).size;

        var fileMetadata = {
            'name': remotePath,
            parents: [ folderId ]
        };
        var media = {
            mimeType: mime.lookup(localPath) || 'application/octet-stream',
            body: fs.createReadStream(localPath)
        };
        return await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id'
        },
        { 
            maxRedirects: 0, //work around the stream backpressure issue
            onUploadProgress: (evt) => {
                const progress = (evt.bytesRead / fileSize) * 100;
                reporter.info(`Uploaded ${progress}%`);
            }
        }); 
    } catch (error) {
        reporter.error('Received an error uploading a file: '+JSON.stringify(error));
    }
}

const uploadFileOrFolder = async (pathType, localPath, remotePath, folderId = null, reporter) => {
    if (pathType === 'directory') await createFolder(remotePath, reporter);
    else await uploadFile(localPath, remotePath, folderId, reporter);
}

let drive;
exports.authenticate = async(keyfile, reporter) => {
    try {
        const auth = new google.auth.JWT({
            email: keyfile.client_email,
            key: keyfile.private_key,
            scopes: [
                'https://www.googleapis.com/auth/drive',
                'https://www.googleapis.com/auth/drive.appdata',
                'https://www.googleapis.com/auth/drive.file',
                'https://www.googleapis.com/auth/drive.metadata',
                'https://www.googleapis.com/auth/drive.metadata.readonly',
                'https://www.googleapis.com/auth/drive.photos.readonly',
                'https://www.googleapis.com/auth/drive.readonly'
            ]
        });

        reporter.info('fetching authentication');
        google.options({auth});

        drive = google.drive('v3');
        reporter.info('got drive connection');
    } catch (error) {
        reporter.panic(`Something went wrong authenticating`+JSON.stringify(error));
    }
}

exports.syncDown = async (localPath, remotePath, reporter) => {
    try {
        let cacheFolder = await findFileOrFolder('directory', remotePath, null, reporter);

        reporter.info(`Got the folder `+JSON.stringify(cacheFolder));

        //!! to convert to truthy and ! to negate it
        if(!!!cacheFolder) cacheFolder = await createFolder(remotePath, reporter);

        await listFolder(cacheFolder.id, reporter);

        const tarFile = await findFileOrFolder ('file', CACHE_TAR, cacheFolder.id, reporter);
        reporter.info('found tar: '+JSON.stringify(tarFile));

        if (!!tarFile) {
            reporter.info(`Fetching tar ${tarFile.name}`);
            await downloadAndExtractTar(tarFile, localPath, reporter);
        } else reporter.warn('Not found a remote cache');

        return cacheFolder.id;

    } catch (error) {
        reporter.error('An error occurred downloading the Tar'+JSON.stringify(error));
    }
}

const rebuildTar = async (localCachePath, reporter) => {
    try {
        reporter.info(`Rebuilding ${CACHE_TAR} from the contents of ${localCachePath}`);
        const tarFile = path.resolve(process.cwd(), CACHE_TAR);

        await tar.c({
            gzip: true,
            file: tarFile
        },
        [ localCachePath ]);

        return tarFile;
    } catch (error) {
        console.log(error);
        reporter.panic('There has been a problem creating the TAR file: '+JSON.stringify(error));
    }
}

const refreshAndUploadTar = async(localCachePath, remoteCachePath, folderId, reporter) => {
    reporter.info(`Refeshing tar file, have the params ${localCachePath} and ${remoteCachePath}`);
    const tarFile = await rebuildTar(localCachePath, reporter);

    reporter.info(`Got the new tar file ${tarFile} and the remote name ${CACHE_TAR}`)
    await uploadFileOrFolder('file', tarFile, CACHE_TAR, folderId, reporter);
}

const refreshAndUploadTarDebounced = _.debounce(async (localCachePath, remoteCachePath, folderId, reporter) => await refreshAndUploadTar(localCachePath, remoteCachePath, folderId, reporter), 5000);

/**
 * Shamelessly swipped from gatsby-source-filesystem; all credit goes to them.
 * https://github.com/gatsbyjs/gatsby/blob/master/packages/gatsby-source-filesystem/src/gatsby-node.js
 * 
 * Create a state machine to manage Chokidar's not-ready/ready states.
 */
const createFSMachine = (
    localCachePath,
    remoteCachePath,
    folderId,
    reporter,
  ) => {

    reporter.info(`Setting up file watch on folder ${localCachePath} pushing to ${remoteCachePath}`);
   
    const log = expr => (ctx, action, meta) => {
      if (meta.state.matches(`BOOTSTRAP.BOOTSTRAPPED`)) {
        reporter.info(expr(ctx, action, meta))
      }
    }
  
    const fsMachine = createMachine(
      {
        id: `fs`,
        type: `parallel`,
        states: {
          BOOTSTRAP: {
            initial: `BOOTSTRAPPING`,
            states: {
              BOOTSTRAPPING: {
                on: {
                  BOOTSTRAP_FINISHED: `BOOTSTRAPPED`,
                },
              },
              BOOTSTRAPPED: {
                type: `final`,
              },
            },
          },
          CHOKIDAR: {
            initial: `NOT_READY`,
            states: {
              NOT_READY: {
                on: {
                  CHOKIDAR_READY: `READY`,
                },
                //exit: `refreshAndUploadTar`,
              },
              READY: {
                on: {
                  CHOKIDAR_ADD: {
                    actions: [
                      `refreshAndUploadTarDebounced`,
                      log(
                        (_, { pathType, path }) => `added ${pathType} at ${path}`
                      ),
                    ],
                  },
                  CHOKIDAR_CHANGE: {
                    actions: [
                      `refreshAndUploadTarDebounced`,
                      log(
                        (_, { pathType, path }) =>
                          `changed ${pathType} at ${path}`
                      ),
                    ],
                  },
                  CHOKIDAR_UNLINK: {
                    actions: [
                      `refreshAndUploadTarDebounced`,
                      log(
                        (_, { pathType, path }) =>
                          `deleted ${pathType} at ${path}`
                      ),
                    ],
                  },
                },
              },
            },
          },
        },
      },
      {
        actions: {
          async refreshAndUploadTarDebounced(_, { pathType, path }) {
            await refreshAndUploadTarDebounced(localCachePath, remoteCachePath, folderId, reporter);
          },
          async refreshAndUploadTar(_, { pathType, path }) {
            await refreshAndUploadTar(localCachePath, remoteCachePath, folderId, reporter);
          },
        },
      }
    )
    return interpret(fsMachine).start()
  }

exports.watch = async (emitter, localCachePath, remoteCachePath, folderId, reporter, options) => {
  // Validate that the path exists.
  if (!fs.existsSync(localCachePath)) {
    reporter.panic(`
The path passed to gatsby-plugin-googlecache does not exist on your file system:
${localCachePath}
Please pick a path to an existing directory.
      `)
  }

  // Validate that the path is absolute.
  // Absolute paths are required to resolve images correctly.
  if (!path.isAbsolute(localCachePath)) {
    localCachePath = path.resolve(process.cwd(), localCachePath)
  }

  reporter.info('this 1')

  const fsMachine = createFSMachine(localCachePath, remoteCachePath, folderId, reporter)

  reporter.info('this 2')

  // Once bootstrap is finished, we only let one File node update go through
  // the system at a time.
  emitter.on(`BOOTSTRAP_FINISHED`, () => {
    fsMachine.send(`BOOTSTRAP_FINISHED`)
  })

  reporter.info('this 3')

  const watcher = chokidar.watch(localCachePath, {
    ignored: [
      `**/*.un~`,
      `**/.DS_Store`,
      `**/.gitignore`,
      `**/.npmignore`,
      `**/.babelrc`,
      `**/yarn.lock`,
      `**/bower_components`,
      `**/node_modules`,
      `../**/dist/**`,
      ...(options.ignore || []),
    ],
  });

  reporter.info('this 4')

  watcher.on(`add`, path => {
    fsMachine.send({ type: `CHOKIDAR_ADD`, pathType: `file`, path })
  });

  reporter.info('this 5')

  watcher.on(`change`, path => {
    fsMachine.send({ type: `CHOKIDAR_CHANGE`, pathType: `file`, path })
  });

  reporter.info('this 6')

  watcher.on(`unlink`, path => {
    fsMachine.send({ type: `CHOKIDAR_UNLINK`, pathType: `file`, path })
  });

  reporter.info('this 7')

  watcher.on(`addDir`, path => {
    fsMachine.send({ type: `CHOKIDAR_ADD`, pathType: `directory`, path })
  });

  reporter.info('this 8')

  watcher.on(`unlinkDir`, path => {
    fsMachine.send({ type: `CHOKIDAR_UNLINK`, pathType: `directory`, path })
  });

  reporter.info('this 9')

  return new Promise((resolve, reject) => {
    watcher.on(`ready`, () => {
        reporter.info('this 10');
      fsMachine.send({ type: `CHOKIDAR_READY`, resolve, reject })
    });
  });
}
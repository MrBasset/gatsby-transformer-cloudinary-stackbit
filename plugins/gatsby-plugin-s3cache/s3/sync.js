const chokidar = require(`chokidar`);
const { createMachine, interpret } = require(`xstate`);
const fs = require('fs-extra');
const path = require('path');
const S3SyncClient = require('s3-sync-client');
const Uniqueue = require('uniqueue');
const { push, pop, remaining } = new Uniqueue();

const _ = require('lodash');

exports.authenticate = ({key, secret, region}, reporter) => {
  try {
    reporter.info('fetching authentication');

    const client = new S3SyncClient({
      region: region,
      credentials: {
        accessKeyId: key,
        secretAccessKey: secret,
      },
    });

    reporter.info(JSON.stringify(client));

    return client;
  } catch (error) {
    reporter.panic(`Something went wrong authenticating`+JSON.stringify(error));
  }
}

exports.syncDown = async (client, localPath, remotePath, reporter) => {
    try {
      reporter.info(`Syncing ${remotePath} to ${localPath}`);
      const { TransferMonitor } = S3SyncClient;
      const monitor = new TransferMonitor();
      monitor.on('progress', (progress) => {
        logProgessDebounced(`Downloading file ${localPath} from s3`, progress, reporter);
      });

      await client.sync(remotePath, localPath, { monitor });

    } catch (error) {
      console.log(error);
        console.log(error);
        reporter.error('An error occurred downloading the Tar'+JSON.stringify(error));
    }
}

const upsertFiles = async(client, fullLocalDirectoryPath, fullRemoteDirectoryPath, reporter) => {
  try {
    const { TransferMonitor } = S3SyncClient;
    const monitor = new TransferMonitor();

    monitor.on('progress', (progress) => {
      logProgessDebounced(`Sync'ing directory ${fullLocalDirectoryPath}`, progress, reporter);
    });

    await client.sync(fullLocalDirectoryPath, fullRemoteDirectoryPath, { monitor, del: true });

  } catch (error) {
    console.log(error);
    reporter.error(`An error occurred sync'ing file ${fullLocalPath}. ` + JSON.stringify(error));
  }
}

const logProgress = (message, progress, reporter) => {
  const total = progress.size.total / 1024 / 1024;
  const current = progress.size.current / 1024 / 1024;

  reporter.info(`${message}, ${current.toFixed(2)}MB/${total.toFixed(2)}MB. File ${progress.count.current} of ${progress.count.total}`);
}

const logProgessDebounced = _.debounce((message, progress, reporter) => logProgress(message, progress, reporter), 500, { 'leading': true, 'trailing': false });

/*
 * When a file has been changed we extract the parent directory from the filepath (as the S3 sync works at directory 
 * level) and add this to a uiqueue (only one single instance of each directory in the queue at a time). A debounce
 * function is then used to call a flush queue, during which all the directories are processed.
 * 
 * Note: figure out how to handle directories being added to the queue whilst we are flushing it.
 * 
 * 
 */
const queueFileParentDirectory = async (client, bucket, fullLocalFilePath, reporter) => {
  const directoryPath = path.dirname(fullLocalFilePath);
  push (directoryPath);

  await flushDirectoryQueueDebounced(client, bucket, reporter);
}

const flushDirectoryQueue = async(client, bucket, reporter) => {
  while(remaining() > 0) {
    const directoryPath = pop();
    const remotePath = `s3://${bucket}/${path.resolve(process.cwd(), directoryPath)}`;

    await upsertFiles(client, directoryPath, remotePath, reporter);
  }
}

const FLUSH_WAIT=10000;
const flushDirectoryQueueDebounced = _.debounce(async (client, bucket, reporter) => await flushDirectoryQueue(client, bucket, reporter), FLUSH_WAIT);

/**
 * Shamelessly swipped from gatsby-source-filesystem; all credit goes to them.
 * https://github.com/gatsbyjs/gatsby/blob/master/packages/gatsby-source-filesystem/src/gatsby-node.js
 * 
 * Create a state machine to manage Chokidar's not-ready/ready states.
 */
const createFSMachine = (
    client,
    localCachePath, 
    localPublicPath,
    bucket,
    reporter,
  ) => {

    reporter.info(`Setting up file watch on folders ${localCachePath} and ${localPublicPath} pushing to ${bucket}`);
   
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
                      `upsertFile`,
                      log(
                        (_, { pathType, filePath }) => `added ${pathType} at ${filePath}`
                      ),
                    ],
                  },
                  CHOKIDAR_CHANGE: {
                    actions: [
                      `upsertFile`,
                      log(
                        (_, { pathType, filePath }) =>
                          `changed ${pathType} at ${filePath}`
                      ),
                    ],
                  },
                  CHOKIDAR_UNLINK: {
                    actions: [
                      `deleteFile`,
                      log(
                        (_, { pathType, filePath }) =>
                          `deleted ${pathType} at ${filePath}`
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
          async upsertFile(_, { pathType, filePath }) {

            queueFileParentDirectory (client, bucket, filePath, reporter);
          },
          async deleteFile(_, { pathType, filePath }) {

            queueFileParentDirectory (client, bucket, filePath, reporter);
          },
        },
      }
    )
    return interpret(fsMachine).start()
  }

exports.watch = async (client, emitter, options, reporter) => {

  const { 
    localCachePath,
    localPublicPath,
    bucket,
  } = options;

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

  // Validate that the path exists.
  if (!fs.existsSync(localPublicPath)) {
    reporter.panic(`
The path passed to gatsby-plugin-googlecache does not exist on your file system:
${localPublicPath}
Please pick a path to an existing directory.
      `)
  }

  // Validate that the path is absolute.
  // Absolute paths are required to resolve images correctly.
  if (!path.isAbsolute(localPublicPath)) {
    localPublicPath = path.resolve(process.cwd(), localPublicPath)
  }

  const fsMachine = createFSMachine(client, localCachePath, localPublicPath, bucket, reporter);

  // Once bootstrap is finished, we only let one File node update go through
  // the system at a time.
  emitter.on(`BOOTSTRAP_FINISHED`, () => {
    fsMachine.send(`BOOTSTRAP_FINISHED`)
  })

  const watcher = chokidar.watch([localCachePath, localPublicPath], {
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

  watcher.on(`add`, filePath => {
    fsMachine.send({ type: `CHOKIDAR_ADD`, pathType: `file`, filePath })
  });

  watcher.on(`change`, filePath => {
    fsMachine.send({ type: `CHOKIDAR_CHANGE`, pathType: `file`, filePath })
  });

  watcher.on(`unlink`, filePath => {
    fsMachine.send({ type: `CHOKIDAR_UNLINK`, pathType: `file`, filePath })
  });

  return new Promise((resolve, reject) => {
    watcher.on(`ready`, () => {
      fsMachine.send({ type: `CHOKIDAR_READY`, resolve, reject })
    });
  });
}
const {
    getBase64,
    getImageURL,
    getDominantColor,
    getTracedSVG,
} = require('./get-image-objects/get-shared-image-data');
const { setPluginOptions, getPluginOptions } = require('./options');
const pluginOptions = getPluginOptions();

const path = require('path');
const { generateImageData } = require('gatsby-plugin-image');

const { stripIndent } = require("common-tags");

const { uploadImageNodeToCloudinary, createNamedTransformation, updateNamedTransformation, getAllTransformations } = require('./upload');
const { createImageNode } = require('./create-image-node');
const {
    createAssetNodesFromData,
} = require('./gatsby-node/create-asset-nodes-from-data');

const { getAllCloudinaryImages, downloadFile, downloadArchive } = require('./download');

const ALLOWED_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/gif'];

const findTransformation = (transformations, name) => {
    for(const t of transformations) {
        if (t.name == `t_${name}`) return true;
    }
    return false;
}

const STACKBIT_THUMBNAIL = 'stackbit_thumbnail'

exports.onPreBootstrap = async ({ reporter, cache }, options) => {

    try {

        reporter.info('Creating named transformations');
        const namedTransformations = [
            {
                name: STACKBIT_THUMBNAIL,
                transformations: 'w_224,h_173,c_limit,q_auto'
            },
            ...options.namedTransformations
        ];

        const existingTransformations = await getAllTransformations();

        for(const namedTran of namedTransformations) {
            //does the transformation exist already?
            if(findTransformation(existingTransformations.transformations, namedTran.name)) await updateNamedTransformation(namedTran.name, namedTran.transformations, reporter);
            else await createNamedTransformation(namedTran.name, namedTran.transformations, reporter);
        }

        /*
         * TODO: the get resources API will hand back the assets in batches of 500. The archive, 
         * if enabled, can hand back 1000 original assets, or 5000 derived assets.
         * 
         * For now work on the principle that 5000 assets is enough.
         * 
         * We'll need to iterate through the returned assets creating new nodes where they are required and in cache.
         * However, all the images will need to be downloaded (unless you want to put them into S3 as well?)
         */

        if(options.archive_enabled) {
            reporter.info('Archive downloading enabled')
            await downloadArchive(options.downloadFolder, { transformations: `t_${STACKBIT_THUMBNAIL}` }, reporter);
        }
        else {
            reporter.info('Downloading individual images');
        }

        let next_cursor, loop = true;
        while (loop) {
            const results = await getAllCloudinaryImages(reporter, next_cursor);

            if(results.next_cursor) next_cursor = results.next_cursor;
            else loop = false;

            if (results.resources) {
                for (const image of results.resources) {

                    const url = getImageURL({
                        public_id: image.public_id,
                        cloudName: options.cloudName,
                        transformations: [`t_${STACKBIT_THUMBNAIL}`],
                        format: image.format
                    });

                    const cacheKey = `${options.cloudName}::${image.public_id}`;

                    const cached = await cache.get(cacheKey);
                    //don't bother downloading the image, we have it cached already (may need to review this)
                    if (!!cached) continue;

                    let headers;
                    if(!options.archive_enabled) {
                        headers = await downloadFile(url, options.downloadFolder, reporter);
                    }

                    const cachedCloudinaryImage = {
                        //etag: headers?.etag,
                        url: url,
                        cloudName: options.cloudName,
                        public_id: image.public_id,

                        responsive_breakpoints: [],
                        version: image.version,
                        height: image.height,
                        width: image.width,
                        format: image.format,
                    }

                    reporter.info(`Caching downloaded image with key (${cacheKey}) as: ` + JSON.stringify(cachedCloudinaryImage));

                    await cache.set(cacheKey, cachedCloudinaryImage);
                }
            }
        }
    } catch (error) {
        reporter.panic(JSON.stringify(error));
    }
}

const generateImageSource = (baseURL, width, height, format, fit, options) => {

    console.log(`Generating image source, have the dimensions width: ${width} and height: ${height}. Options are`, options);

    //use spread to clone the objects
    const transformations = [...options.transformations];
    transformations.push(`w_${width}`);
    transformations.push(`h_${height}`);

    const src = getImageURL({
        public_id: baseURL,
        cloudName: options.cloudName,
        transformations,
        chained: options.chained,
        format
    });

    return { src, width, height, format }
}

exports.createSchemaCustomization = ({ actions, reporter }) => {

    const { createTypes, createFieldExtension } = actions

    createFieldExtension({
        name: 'CloudinaryAsset',
        extend: (options, prevFieldConfig) => ({
            resolve: function (src, args, context, info) {

                // look up original string, i.e img/photo.jpg
                const { fieldName } = info
                const partialPath = src[fieldName]

                if (!partialPath) {
                    return null
                }

                const { downloadFolder } = pluginOptions;
                const arr = downloadFolder.split("/");
                const basePath = arr.slice(0, arr.length-1).join("/");

                // get the absolute path of the image file in the filesystem
                const filePath = path.join(
                    basePath,
                    partialPath
                )

                // look for a node with matching path
                const fileNode = context.nodeModel.runQuery({
                    firstOnly: true,
                    type: 'File',
                    query: {
                        filter: {
                            absolutePath: {
                                eq: filePath
                            }
                        }
                    }
                });

                // no node? return
                if (!fileNode) {
                    return null;
                }

                // else return the node
                return fileNode;
            }
        })
    });

    createTypes(`

    input BlurUpOptions {
        width: Int
        defaultBase64: String
        extraTransforms: [String]
    }

    input ResizeOptions {
        resize: Resize
        qualifiers: String
    }

    input TracedSVGOptions {
        detail: Float
        defaultBase64: String
        numColors: Int
    }

    enum Formats {
        AUTO
        AVIF
        JPEG
        PNG
        WEBP
    }
  
    enum Placeholder {
        BLURRED
        DOMINANT_COLOR
        NONE
        TRACED_SVG
    }

    enum Resize {
        CROP
        FILL
        FIT
        PAD
        SCALE
        THUMB
    }
    `);
}

exports.createResolvers = ({ createResolvers, reporter, cache }) => {
    createResolvers({
        CloudinaryAsset: {
            gatsbyImageData: {
                type: `JSON!`,
                args: {
                    layout: {
                        type: `GatsbyImageLayout`,
                        description: stripIndent`
                        The layout for the image.
                        FIXED: A static image sized, that does not resize according to the screen width
                        FULL_WIDTH: The image resizes to fit its container. Pass a "sizes" option if it isn't going to be the full width of the screen.
                        CONSTRAINED: Resizes to fit its container, up to a maximum width, at which point it will remain fixed in size.
                        `,
                    },
                    width: {
                        type: `Int`,
                        description: stripIndent`
                        The display width of the generated image for layout = FIXED, and the display width of the largest image for layout = CONSTRAINED.
                        The actual largest image resolution will be this value multiplied by the largest value in outputPixelDensities
                        Ignored if layout = FULL_WIDTH.
                    `,
                    },
                    height: {
                        type: `Int`,
                        description: stripIndent`
                        If set, the height of the generated image. If omitted, it is calculated from the supplied width, matching the aspect ratio of the source image.`,
                    },
                    aspectRatio: {
                        type: `Float`,
                        description: stripIndent`
                        If set along with width or height, this will set the value of the other dimension to match the provided aspect ratio, cropping the image if needed.
                        If neither width or height is provided, height will be set based on the intrinsic width of the source image.
                    `,
                    },
                    sizes: {
                        type: `String`,
                        description: stripIndent`
                        The "sizes" property, passed to the img tag. This describes the display size of the image.
                        This does not affect the generated images, but is used by the browser to decide which images to download. You can leave this blank for fixed images, or if the responsive image
                        container will be the full width of the screen. In these cases we will generate an appropriate value.
                    `,
                    },
                    outputPixelDensities: {
                        type: `[Float]`,
                        description: stripIndent`
                        A list of image pixel densities to generate for FIXED and CONSTRAINED images. You should rarely need to change this. It will never generate images larger than the source, and will always include a 1x image.
                        Default is [ 1, 2 ] for fixed images, meaning 1x, 2x, 3x, and [0.25, 0.5, 1, 2] for fluid. In this case, an image with a fluid layout and width = 400 would generate images at 100, 200, 400 and 800px wide.
                        Ignored for FULL_WIDTH, which uses breakpoints instead.
                        `,
                    },
                    backgroundColor: {
                        type: `String`,
                        description: `Background color applied to the wrapper, or when "letterboxing" an image to another aspect ratio.`,
                    },
                    blurUpOptions: {
                        type: `BlurUpOptions`,
                        description: stripIndent`Custom transformations applied specifically to the base64 Placeholder`,
                    },
                    chained: {
                        type: "String",
                        description: stripIndent`Additional transformations to apply as chains following the main transformations`,
                    },
                    formats: {
                        type: `[Formats]`,
                        description: stripIndent`An array of the formats to return for the images`,
                    },
                    namedTransformations: {
                        type: `[String]`,
                        description: stripIndent`An array of named transformation to apply to an image.`
                    },
                    overrideTransformations: {
                        type: `[String]`,
                        description: stripIndent`An array of transformations, will override all other settings except for width and height`
                    },
                    placeholder: {
                        type: `Placeholder`,
                        description: stripIndent`The type of placeholder to use whilst the image is loading`
                    },
                    resizeOptions: {
                        type: `ResizeOptions`,
                        description: stripIndent`The effect to apply when resizing the image`
                    },
                    tracedSVGOptions: {
                        type: `TracedSVGOptions`,
                        description: stripIndent`The effects to apply to the traced svg`
                    },
                },
                resolve: async (src, options, args) => {

                    reporter.info('In resolveGatsbyImageData, got the image', src);

                    let {
                        cloudName,
                        format,
                        originalHeight,
                        originalWidth,
                        public_id,
                        version
                    } = src;

                    let {
                        blurUpOptions = {},
                        chained,
                        formats = ['AUTO'],
                        height,
                        layout = 'CONSTRAINED',
                        namedTransformations = [],
                        overrideTransformations = [],
                        placeholder = 'BLURRED',
                        resizeOptions = {},
                        tracedSVGOptions = {},
                        width
                    } = options;

                    //todo build a single transformations array to pass to the function.
                    let transformations = overrideTransformations;
                    if (!!overrideTransformations) {
                        transformations = namedTransformations;

                        if (resizeOptions && resizeOptions.resize) {
                            transformations.push(`c_${resizeOptions.resize.toLowerCase()}`);

                            if (resizeOptions.qualifiers) transformations.push(resizeOptions.qualifiers);
                        }
                    }

                    const sourceMetadata = {
                        format: format,
                        height: originalHeight,
                        width: originalWidth,
                    }

                    const cloudinary = {
                        version: version,
                        public_id: public_id,
                        cloudName: cloudName
                    };

                    const combined = { ...options, ...cloudinary, formats, transformations }

                    const imageDataArgs = {
                        pluginName: `gatsby-transformer-cloudinary-stackbit`,
                        sourceMetadata,
                        generateImageSource,
                        filename: public_id,
                        layout,
                        options: combined,
                        width,
                        height
                    }

                    const cacheKeyPrefix = `${cloudName}::${public_id}`;

                    if (placeholder === "BLURRED") {

                        if (!!blurUpOptions.defaultBase64) {
                            imageDataArgs.placeholderURL = blurUpOptions.defaultBase64
                        } else {

                            const cached = await cache.get(`${cacheKeyPrefix}::blurred64`);
                            if (!!cached) {
                                imageDataArgs.placeholderURL = cached;
                            } else {

                                const bWidth = blurUpOptions.width || 30;

                                imageDataArgs.placeholderURL = await getBase64({
                                    base64Width: bWidth,
                                    chained,
                                    cloudName,
                                    public_id,
                                    transformations,
                                    version,
                                });

                                await cache.set(`${cacheKeyPrefix}::blurred64`, imageDataArgs.placeholderURL);
                            }
                        }
                    }
                    else if (placeholder === "DOMINANT_COLOR") {
                        const cached = await cache.get(`${cacheKeyPrefix}::dominant`);
                        if(!!cached) {
                            imageDataArgs.placeholderURL = cached;
                        } else {
                            imageDataArgs.backgroundColor = await getDominantColor({ public_id });

                            await cache.set(`${cacheKeyPrefix}::dominant`, imageDataArgs.placeholderURL);
                        }
                    }
                    else {
                        if (!!tracedSVGOptions.defaultBase64) {
                            imageDataArgs.placeholderURL = tracedSVGOptions.defaultBase64;
                        } else {
                            const cached = await cache.get(`${cacheKeyPrefix}::traced64`);
                            if(!!cached) {
                                imageDataArgs.placeholderURL = cached;
                            } else {
                                imageDataArgs.placeholderURL = await getTracedSVG({
                                    chained,
                                    cloudName,
                                    public_id,
                                    transformations,
                                    colors: tracedSVGOptions.colors,
                                    detail: tracedSVGOptions.detail,
                                    version
                                });

                                await cache.set(`${cacheKeyPrefix}::traced64`, imageDataArgs.placeholderURL);
                            }
                        }
                    }

                    return generateImageData(imageDataArgs);
                }
            },
        },
    })
}

async function createAssetNodeFromFile({
    node,
    actions: { createNode, createParentChildLink },
    cache,
    createNodeId,
    createContentDigest,
    reporter,
}) {
    if (!ALLOWED_MEDIA_TYPES.includes(node.internal.mediaType)) {
        return;
    }

    const relativePathWithoutExtension = node.relativePath.replace(
        /\.[^.]*$/,
        '',
    );
    const cacheKey = `${getPluginOptions().cloudName}::${getPluginOptions().uploadFolder}/${relativePathWithoutExtension}`;
    let cloudinaryUploadResult = {}

    const cached = await cache.get(cacheKey);
    if (!!cached) {

        cloudinaryUploadResult = {
            responsive_breakpoints: [],
            public_id: cached.public_id,
            version: cached.version,
            height: cached.height,
            width: cached.width,
            format: cached.format,
        }
    }
    else {
        cloudinaryUploadResult = await uploadImageNodeToCloudinary({
            node,
            reporter,
        });
    }

    const imageNode = createImageNode({
        cloudinaryUploadResult,
        parentNode: node,
        createContentDigest,
        createNodeId,
        cloudName: getPluginOptions().cloudName,
    });

    // Add the new node to Gatsby’s data layer.
    createNode(imageNode);

    // Tell Gatsby to add `childCloudinaryAsset` to the parent `File` node.
    createParentChildLink({
        parent: node,
        child: imageNode,
    });

    return imageNode;
}

exports.onCreateNode = async ({
    node,
    actions,
    cache,
    createNodeId,
    createContentDigest,
    reporter,
}) => {

    // Create nodes from existing data with CloudinaryAssetData node type
    createAssetNodesFromData({
        node,
        actions,
        createNodeId,
        createContentDigest,
        reporter,
    });

    if (node.internal.type !== 'File') return;

    // Create nodes for files to be uploaded to cloudinary
    if (pluginOptions.apiKey && pluginOptions.apiSecret && pluginOptions.cloudName) {
        await createAssetNodeFromFile({
            node,
            actions,
            cache,
            createNodeId,
            createContentDigest,
            reporter,
        });
    }
};

exports.onPreInit = ({ reporter }, pluginOptions) => {
    setPluginOptions({ pluginOptions, reporter });
};
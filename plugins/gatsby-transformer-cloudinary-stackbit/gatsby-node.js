const {
    getBase64,
    getImageURL,
    getDominantColor,
    getTracedSVG,
} = require('./get-image-objects/get-shared-image-data');
const { setPluginOptions, getPluginOptions } = require('./options');
const pluginOptions = getPluginOptions();

const { generateImageData } = require('gatsby-plugin-image');
const { getGatsbyImageResolver } = require('gatsby-plugin-image/graphql-utils');

const { stripIndent } = require("common-tags");

const { uploadImageNodeToCloudinary } = require('./upload');
const { createImageNode } = require('./create-image-node');
const {
  createAssetNodesFromData,
} = require('./gatsby-node/create-asset-nodes-from-data');

const { getAllCloudinaryImages, downloadFile } = require('./download');

const ALLOWED_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/gif'];

exports.onPreBootstrap = async ({ reporter }, options ) => {

    try {
    const results = await getAllCloudinaryImages(reporter);

    if (results.resources) {
        results.resources.forEach(async image => {

            const url = getImageURL({
                public_id: image.public_id,
                cloudName: options.cloudName,
                transformations: ['w_275'],
                format: image.format
            });

            await downloadFile(url, options.downloadFolder, reporter);
        });
    }
    } catch (error) {
        reporter.panic(error);
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

const resolveGatsbyImageData = async (image, options, args) => {

    let {
        cloudName,
        format,
        originalHeight,
        originalWidth,
        public_id,
        version
    } = image;

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

    const combined = {...options, ...cloudinary, formats, transformations }

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
    // Generating placeholders is optional, but recommended
    if (placeholder === "BLURRED") {

        if (!!blurUpOptions.defaultBase64) {
            imageDataArgs.placeholderURL = blurUpOptions.defaultBase64
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
        }
    }
    else if (placeholder === "DOMINANT_COLOR") {
        imageDataArgs.backgroundColor = await getDominantColor({public_id});
    }
    else {
        if (!!tracedSVGOptions.defaultBase64) {
            imageDataArgs.placeholderURL = tracedSVGOptions.defaultBase64;
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
        }
    }

    //const returnedImage = generateImageData(imageDataArgs);
    return generateImageData(imageDataArgs);
}

exports.createSchemaCustomization = ({ actions }) => {
    
    const { createTypes, createFieldExtension } = actions

    createFieldExtension({
        name: 'fileByAbsolutePath',
        extend: (options, prevFieldConfig) => ({
            resolve: function (src, args, context, info) {

                // look up original string, i.e img/photo.jpg
                const { fieldName } = info
                const partialPath = src[fieldName]
                if (!partialPath) {
                    return null
                }

                // get the absolute path of the image file in the filesystem
                const filePath = path.join(
                    __dirname,
                    'static',
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

exports.createResolvers = ({ createResolvers, reporter }) => {
    createResolvers({
        CloudinaryAsset: {
            gatsbyImageData: getGatsbyImageResolver(resolveGatsbyImageData, {
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
            }),
        },
    })
}

async function createAssetNodeFromFile({
    node,
    actions: { createNode, createParentChildLink },
    createNodeId,
    createContentDigest,
    reporter,
}) {
    if (!ALLOWED_MEDIA_TYPES.includes(node.internal.mediaType)) {
        return;
    }

    reporter.verbose('creating asset node from file');

    const cloudinaryUploadResult = await uploadImageNodeToCloudinary({
        node,
        reporter,
    });

    const imageNode = createImageNode({
        cloudinaryUploadResult,
        parentNode: node,
        createContentDigest,
        createNode,
        createNodeId,
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

    // Create nodes for files to be uploaded to cloudinary
    if (pluginOptions.apiKey && pluginOptions.apiSecret && pluginOptions.cloudName) {
        await createAssetNodeFromFile({
            node,
            actions,
            createNodeId,
            createContentDigest,
            reporter,
        });
    }
};

exports.onPreInit = ({ reporter }, pluginOptions) => {
    setPluginOptions({ pluginOptions, reporter });
};
const {
    getAspectRatio,
    getBase64,
    getImageURL,
    getDominantColor,
} = require('./get-image-objects/get-shared-image-data');
const { setPluginOptions, getPluginOptions } = require('./options');
const pluginOptions = getPluginOptions();

const { generateImageData } = require('gatsby-plugin-image');
const { getGatsbyImageResolver } = require('gatsby-plugin-image/graphql-utils');

const { uploadImageNodeToCloudinary } = require('./upload');
const { createImageNode } = require('./create-image-node');
const {
  createAssetNodesFromData,
} = require('./gatsby-node/create-asset-nodes-from-data');

const { getAllCloudinaryImages, downloadFile } = require('./download');

const ALLOWED_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/gif'];

exports.onPreBootstrap = async ({ store, cache, reporter }, options ) => {

    console.log("onPreBootstrap")
    const results = await getAllCloudinaryImages(reporter);

    console.log('results',results);

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
}

const generateImageSource = (baseURL, width, height, format, fit, options) => {

    console.log('generateImageSource::params',baseURL, width, height, format, fit, options);

    const transformations = []; //options.transformations;
    transformations.push[`w_${width}`];
    transformations.push[`h_${height}`];

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

    console.log('Image', image);
    console.log('options', options);
    console.log('args', args);

    let {
        cloudName,
        format,
        originalHeight,
        originalWidth,
        public_id,
        version
    } = image;

    let {
        chained,
        formats = ['AUTO'],
        height,
        layout = 'CONSTRAINED',
        placeholder = 'BLURRED',
        transformations,
        width
    } = options;

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

    const combined = {...options, ...cloudinary, formats }

    console.log('Combined', combined);

    const imageDataArgs = {
        pluginName: `gatsby-transformer-cloudinary-stackbit`,
        sourceMetadata,
        generateImageSource,
        filename: public_id,
        layout,
        options: combined,
        width: width || originalWidth,
        height: height || originalHeight
    }
    // Generating placeholders is optional, but recommended
    if (placeholder === "BLURRED") {

        //TODO: need to get this a different way, preferably computing only once
        imageDataArgs.placeholderURL = await getBase64({
            base64Width: 30,
            chained,
            cloudName,
            public_id,
            transformations,
            version,
        });
    }
    else if (placeholder === "DOMINANT_COLOR") {
        imageDataArgs.backgroundColor = await getDominantColor(image.public_id);
    }

    console.log("imageDataArgs is: ", imageDataArgs);

    // You could also calculate dominant color, and pass that as `backgroundColor`
    // gatsby-plugin-sharp includes helpers that you can use to generate a tracedSVG or calculate
    // the dominant color of a local file, if you don't want to handle it in your plugin
    const returnedImage = generateImageData(imageDataArgs);

    console.log("Returned Image is: ", returnedImage);

    return returnedImage;
}

exports.createSchemaCustomization = ({ actions }) => {
    actions.createTypes(`

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
    `);
}

exports.createResolvers = ({ createResolvers, reporter }) => {
    createResolvers({
        CloudinaryAsset: {
            // loadImageData is your custom resolver, defined in step 2
            gatsbyImageData: getGatsbyImageResolver(resolveGatsbyImageData, {
                Chained: "String",
                Formats: "[Formats]",
                Placeholder: "Placeholder",
                Transformations: "String"
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

    reporter.info('creating asset node from file');

    const cloudinaryUploadResult = await uploadImageNodeToCloudinary({
        node,
        reporter,
    });

    reporter.info('uploaded to cloudinary');

    const imageNode = createImageNode({
        cloudinaryUploadResult,
        parentNode: node,
        createContentDigest,
        createNode,
        createNodeId,
    });

    // Add the new node to Gatsby’s data layer.
    createNode(imageNode);

    reporter.info('created image node');

    // Tell Gatsby to add `childCloudinaryAsset` to the parent `File` node.
    createParentChildLink({
        parent: node,
        child: imageNode,
    });

    reporter.info('created parent link');

    return imageNode;
}

exports.onCreateNode = async ({
    node,
    actions,
    createNodeId,
    createContentDigest,
    reporter,
}) => {
    reporter.info('In on Create Node');


    // Create nodes from existing data with CloudinaryAssetData node type
    createAssetNodesFromData({
        node,
        actions,
        createNodeId,
        createContentDigest,
        reporter,
    });

    reporter.info('PluginOptions are: ' + JSON.stringify(pluginOptions));

    // Create nodes for files to be uploaded to cloudinary
    if (pluginOptions.apiKey && pluginOptions.apiSecret && pluginOptions.cloudName) {
        reporter.info('Passing to create asset nodes from file');

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
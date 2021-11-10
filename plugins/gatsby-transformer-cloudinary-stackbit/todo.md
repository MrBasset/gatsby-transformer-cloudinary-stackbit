## Current
[ ] Get editing working in Stackbit
[ ] Stop regenerating images when creating Stackbit container (this is going to generate massive costs)

## Plugin Todo

[x] Get plugin working with Cloudinary and Gatsby Image
[x] Sort out passing additional options to plugin for Cloudinary Support. Missing Parameters
    [x] base64Transformations - expand this as some set options (width and default)
    [x] Chained
    [x] Formats
    [x] placeHolder
    [x] tracedSVGTransformations - expand this with set options (quality, colours, default)
    [x] transformations
[x] Do I need to make a custom resolver, or can I continue to use the gatsby-plugin
[x] Why am I getting an empty source set - investigate?
[x] Fix dominant colour
[x] Implement Traced SVG
[x] Implement fit for images
[n/a] Fix Breakpoints - seems to be ignored by gatsby image. Maybe remove this from the function?
[x] Images are not scaling with changes to width and vice versa
[x] Width is not being added to the cloudinary URL
[ ] Add more detail for the descriptions, including options, to the extended resolver for the CloudinaryAsset::gatsbyImageData function

[x] Add option to download images from zip file or individually; depending on Cloudinary plan.
[x] Throw build panic if cloundinary names are not specified.
[ ] Can we take data from frontmatter and pass these to GraphQL queries - I think that this could be done with a totally custom resolver. You can pull these additional values from the context.
[x] During plugin startup, all Images are downloaded, and then re-uploaded to Cloudinary by the node watcher. Need to have some sort of state that is managed here.

[ ] How does Gatsby resolve that a node is a file? We are doing a lookup on the URL to see if it exists and making this a file. Stackbit will record the path in relation to the image directory (so image/example.jpg), we will need to ensure that this is translated to being a File node. The absolutefilepath is what I've used for Schema extension, but I don't want to force people to have to full define the schema.
[ ] Use Joi to defined the options structure

## Stackbit todo
[x] Pull down thumbnails of all images in the folder and load into images (pre-node creation)
[x] Configure demo site as a stackbit site
[x] Figure out how derrived images work => The first time a transformation takes place, an image is derrived from it. Following that further requests are free.
[ ] For any images added, when we upload also create an eager/derived image that represents the stackbit thumbnail size
[ ] Can we create derived images as they are requested? => yes, but not if we want to implement the private uploads and static transformations. Could we create a custom image control that uses the API keys to request the derived image as part of the rendering. Will need to work in the SSR as well as the dev, so maybe not the best idea in case we leak the api secret?
[x] How can we do the base64 - can we download files? => use gatsby-cache for base64 and tracedSVG. Problem is how to get access to the Gatsby cache outside of select API methods?
[x] Figure out how to pass the reporter to the image plugin functions.
[ ] Look to implement private uploads and strict transforms to prevent access to the original image or requests generating an undue cost. This will mean that all images will need to be eagerly generated. In that regard, when creating nodes for an asset, we'll need to work out how many queries refence the image (is that possible) and then eagerly generate any transformations for that image. This way they will all be processed ahead of the game and dealt with upfront, leaving the only variable cost as the download bandwidth and storage costs.

However, we are going to have to solve marking an image as processed - cache I guess?

[ ] Is there value in not downloading the images if they already exist?
[ ] Add a switch so that the images are only downloaded when the environment is not production (e.g. in stackbit)
[ ] allow for custom named transformations to be created in the plugin options
## initial import

## caching improvements thoughts
[ ] can we save our gatsby cache/images to AWS S3 or similar to make for a faster start-up in stackbit studio?


[x] save the fact that we have just downloaded an image to the gatsby cache (use this to prevent attempting to re-upload the image)
[ ] 


[ ] Figure out how to expire the image, the etag in cloudinary has an md5 hash for the image. Can we grab this and put this into the cache?









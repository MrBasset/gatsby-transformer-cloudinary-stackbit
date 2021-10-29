## Thoughts

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
[n/a] Fix Breakpoints - seems to be ignored by gatsby image
[x] Images are not scaling with changes to width and vice versa
[x] Width is not being added to the cloudinary URL

[ ] Add option to download images from zip file or individually; depending on Cloudinary plan.

## Stackbit todo
[x] Pull down thumbnails of all images in the folder and load into images (pre-node creation)
[ ] Configure demo site as a stackbit site
[x] Figure out how derrived images work => The first time a transformation takes place, an image is derrived from it. Following that further requests are free.
[ ] For any images added, we need to replace these with the thumbnail version (do we, they'll eventually be replaced on start up when the container restarts - so we could just go with the upload thing and be done with it)
[ ] For any images added, when we upload also create an eager/derived image that represents the stackbit thumbnail size
[ ] Can we create derived images as they are requested? => yes, but not if we want to implement the private uploads and static transformations.
[ ] How can we do the base64 - can we download files? => use gatsby-cache for base64 and tracedSVG
[ ] Figure out how to pass the reporter to the image plugin functions.
[ ] Look to implement private uploads and strict transforms to prevent access to the original image or requests generating an undue cost. This will mean that all images will need to be eagerly generated. In that regard, when creating nodes for an asset, we'll need to work out how many queries refence the image (is that possible) and then eagerly generate any transformations for that image. This way they will all be processed ahead of the game and dealt with upfront, leaving the only variable cost as the download bandwidth and storage costs.

However, we are going to have to solve marking an image as processed - cache I guess?

[ ] Is there value in not downloading the images if they already exist?

## initial import

## caching improvements todo
[ ] can we save our cache/images to AWS S3 to make for a faster start-up?









Can I use a combination of gatsby-transformer-cloudinary and a seperate plug-in to achive what I need?

gatsby-transformer-cloudinary-stackbit - purpose when starting up, will fetch all assets in Cloudinary with the derived name t_media_lib_thumb as an archive and expand into the src/images so that a) gatsby-transformer-cloudinary can be used to fetch images from the conventional assets and b) the stackbit media library will still work.

Problems:
 * gatsby-transformer-cloudinary doesn't support gatsby-plugin-image
 * will need to catch images that are being uploaded and replace this with the thumbnail without triggering another upload.
 * base64 - this can take a long time to generate. Think of a way to put this into gatsby a different way, maybe <image_id>.base64 file that is then sourced by this plug-in and x-ref'd to the CloudinaryAsset object

 * we need to find a way to either persist the cache, or not call the uploadImage if the cache has been cleared due to the stackbit container restarting. This is to avoid the expense from repeatedly uploading/transforming images in Cloudinary. Thoughts
    - Use the base64 file hack as a means to indicate that an image has been uploaded.
    - Have some sort of sidecar file that tracks the files
    - Introduce some sort of plug-in that will upload/download the gatsby cache to S3 or some other form of storage so that we can persist between container starts.
    - The Cloudinary admin API to get dominant color is rate limited, may need to save the result of this locally as well.
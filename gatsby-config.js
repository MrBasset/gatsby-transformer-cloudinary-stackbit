require('dotenv').config({
  path: `.env.${process.env.NODE_ENV}`,
});

module.exports = {
  siteMetadata: {
    title: `Gatsby Default Starter`,
    description: `Kick off your next, great Gatsby project with this default starter. This barebones starter ships with the main Gatsby configuration files you might need.`,
    author: `@gatsbyjs`,
    siteUrl: `https://gatsbystarterdefaultsource.gatsbyjs.io/`,
  },
  plugins: [
    `gatsby-plugin-react-helmet`,
    `gatsby-plugin-image`,
    {
      resolve: `gatsby-source-filesystem`,
      options: {
        name: `images`,
        path: `${__dirname}/cloudinary/images`,
      },
    },
    {
      resolve: `gatsby-source-filesystem`,
      options: {
          name: `pages`,
          path: `${__dirname}/src/pages`,
      }
    },
    {
      resolve: require.resolve(`${__dirname}/plugins/gatsby-transformer-cloudinary-stackbit`),
      options: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
        apiSecret: process.env.CLOUDINARY_API_SECRET,
        uploadFolder: 'plugin-test',
        downloadFolder: `${__dirname}/cloudinary/images`,
        archive_enabled: true,
        namedTransformations: [
          { name: 'tcs_watermark', transformations: 'c_scale,g_south_east,l_tcs-logo,o_40,w_100/e_cut_out,g_south_west,l_text:Arial_12_bold:© Timothy Christian School,x_10,y_10'}
        ]
      },
    },
    {
      resolve: require.resolve(`${__dirname}/plugins/gatsby-plugin-s3cache`),
      options: {
        localCachePath: `${__dirname}/.cache`,
        localPublicPath: `${__dirname}/public`,
        bucket: 'gatsby-stackbit-test',
        key: process.env.S3_API_KEY,
        secret: process.env.S3_API_SECRET,
        region: 'ca-central-1'
      },
    },
    `gatsby-transformer-remark`,
    // {
    //   resolve: `gatsby-plugin-manifest`,
    //   options: {
    //     name: `gatsby-starter-default`,
    //     short_name: `starter`,
    //     start_url: `/`,
    //     background_color: `#663399`,
    //     // This will impact how browsers show your PWA/website
    //     // https://css-tricks.com/meta-theme-color-and-trickery/
    //     // theme_color: `#663399`,
    //     display: `minimal-ui`,
    //     icon: `cloudinary/images/gatsby-icon.png`, // This path is relative to the root of the site.
    //   },
    // },
    // this (optional) plugin enables Progressive Web App + Offline functionality
    // To learn more, visit: https://gatsby.dev/offline
    // `gatsby-plugin-offline`,
  ],
}

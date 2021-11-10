/**
 * Implement Gatsby's Node APIs in this file.
 *
 * See: https://www.gatsbyjs.com/docs/node-apis/
 */

// You can delete this file if you're not using it

const path = require('path');
const { createFilePath } = require('gatsby-source-filesystem');

exports.onCreateNode = ({ node, actions, getNode }) => {
    const { createNodeField } = actions

    if (node.internal.type === `MarkdownRemark`) {
        const value = createFilePath({
            node,
            getNode,
        });
        createNodeField({
            node,
            name: `slug`,
            value,
        })
    }
}

exports.createSchemaCustomization = ({ actions }) => {
  const { createTypes } = actions
  const typeDefs = `
    type MarkdownRemark implements Node {
      frontmatter: Frontmatter
    }
    type Frontmatter {
      fixed_image: File @CloudinaryAsset
      constrained_image: File @CloudinaryAsset
      fullwidth_image: File @CloudinaryAsset
    }
  `
  createTypes(typeDefs)
}

exports.createPages = ({ actions, graphql }) => {
    const { createPage } = actions

    return graphql(`
      {
        pages: allMarkdownRemark {
          edges {
            node {
              frontmatter {
                template
              }
              id
              fields {
                slug
              }
            }
          }
        }
      }
    `).then(result => {
        if (result.errors) {
            result.errors.forEach(e => console.error(e.toString()))
            return Promise.reject(result.errors)
        }

        const posts = result.data.pages.edges;

        posts.forEach(edge => {
            const id = edge.node.id;

            createPage({
                path: edge.node.fields.slug,
                component: path.resolve(
                    `src/templates/${String(edge.node.frontmatter.template)}.js`
                ),
                // additional data can be passed via context
                context: {
                    id,
                },
            })
        });
    })
};
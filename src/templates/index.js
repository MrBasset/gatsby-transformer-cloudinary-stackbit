import * as React from "react"
import { graphql, Link } from "gatsby"
import { GatsbyImage } from "gatsby-plugin-image"

import Layout from "../components/layout"
import Seo from "../components/seo"

export const data = graphql`
query loadIndex($id: String) {
    markdownRemark(id: {eq: $id}) {
        id
        frontmatter {
            title
            fixed_image {
                childCloudinaryAsset{
                    gatsbyImageData(layout: FIXED, width: 512, placeholder: TRACED_SVG)
                }
            }
            fixed_alt
            constrained_image {
                childCloudinaryAsset{
                    gatsbyImageData(
                    layout: CONSTRAINED
                    placeholder: BLURRED
                    formats: WEBP
                    width: 512
                    blurUpOptions: {extraTransforms: "e_grayscale", width: 10}
                    resizeOptions: {resize: FIT}
                    )
                }
            }
            constrained_alt
            fullwidth_image {
                childCloudinaryAsset{
                    gatsbyImageData(layout: FULL_WIDTH, placeholder: DOMINANT_COLOR)
                }
            }
            fullwidth_alt
        }
    }
}
`;


//fetch all images at 224x173

const IndexTemplate = ({data}) => {

    console.log(data);

  return (
    <Layout data-sb-object-id={data.id}>
      <Seo title="Home" />
      <h1 data-sb-field-path="title">{data.markdownRemark.frontmatter.title}</h1>
      <p>Welcome to your new Gatsby site.</p>
      <p>Now go build something great.</p>
      <h2>Gatsby Sharp - Fixed</h2>
      <GatsbyImage data-sb-field-path="fixed_image"
        image={data.markdownRemark.frontmatter.fixed_image.childCloudinaryAsset.gatsbyImageData}
        alt={data.markdownRemark.frontmatter.fixed_alt}
        style={{ marginBottom: `1.45rem` }}
      />
      <h2>Gatsby Sharp - Constrained</h2>
      <GatsbyImage data-sb-field-path="constrained_image"
        image={data.markdownRemark.frontmatter.constrained_image.childCloudinaryAsset.gatsbyImageData}
        alt={data.markdownRemark.frontmatter.constrained_alt}
        style={{ marginBottom: `1.45rem` }}
      />
      <h2>Gatsby Sharp - Full Width</h2>
      <GatsbyImage data-sb-field-path="fullwidth_image"
        image={data.markdownRemark.frontmatter.fullwidth_image.childCloudinaryAsset.gatsbyImageData}
        alt={data.markdownRemark.frontmatter.fullwidth_alt}
        style={{ marginBottom: `1.45rem` }}
      />
      <p>
        <Link to="/page-2/">Go to page 2</Link> <br />
        <Link to="/using-typescript/">Go to "Using TypeScript"</Link>
      </p>
    </Layout>
  )
};

export default IndexTemplate
import * as React from "react"
import { graphql, Link } from "gatsby"
import { GatsbyImage } from "gatsby-plugin-image"

import Layout from "../components/layout"
import Seo from "../components/seo"

export const data = graphql`
  {
    fixed: file(relativePath: {eq: "gatsby-astronaut.png"}) {
      childCloudinaryAsset{
        gatsbyImageData(layout: FIXED, width: 512)
      }
    }
    constrained: file(relativePath: {eq: "gatsby-astronaut.png"}) {
      childCloudinaryAsset{
        gatsbyImageData(width: 512 )
      }
    }
    fullwidth: file(relativePath: {eq: "gatsby-astronaut.png"}) {
      childCloudinaryAsset{
        gatsbyImageData(layout: FULL_WIDTH)
      }
    }
  }
`;


//fetch all images at 224x173

const IndexPage = ({data}) => {

  console.log(data);

  return (
    <Layout>
      <Seo title="Home" />
      <h1>Hi people</h1>
      <p>Welcome to your new Gatsby site.</p>
      <p>Now go build something great.</p>
      <h2>Gatsby Sharp - Fixed</h2>
      <GatsbyImage
        image={data.fixed.childCloudinaryAsset.gatsbyImageData}
        alt="A Gatsby astronaut"
        style={{ marginBottom: `1.45rem` }}
      />
      <h2>Gatsby Sharp - Constrained</h2>
      <GatsbyImage
        image={data.constrained.childCloudinaryAsset.gatsbyImageData}
        alt="A Gatsby astronaut"
        style={{ marginBottom: `1.45rem` }}
      />
      <h2>Gatsby Sharp - Full Width</h2>
      <GatsbyImage
        image={data.fullwidth.childCloudinaryAsset.gatsbyImageData}
        alt="A Gatsby astronaut"
        style={{ marginBottom: `1.45rem` }}
      />
      <p>
        <Link to="/page-2/">Go to page 2</Link> <br />
        <Link to="/using-typescript/">Go to "Using TypeScript"</Link>
      </p>
    </Layout>
  )
};

export default IndexPage

export const loader = async () => {
  return null;
};

export default function PrivacyPolicyPage() {
  return (
    <main style={{ maxWidth: 760, margin: "40px auto", padding: "0 20px", fontFamily: "system-ui, sans-serif", lineHeight: 1.6 }}>
      <h1>VibeProof Privacy Policy</h1>
      <p>Last updated: October 7, 2026</p>
      <p>
        VibeProof is a Shopify reviews application. It processes information needed
        to collect, moderate, display, import, and analyze product reviews for stores
        that use the app.
      </p>
      <h2>Information VibeProof processes</h2>
      <p>
        Depending on merchant settings, review submissions can include a reviewer
        name, email address, star rating, written review, product and variant context,
        photos or videos, and storefront interaction events such as review-widget
        views and helpful votes. For purchase-linked review requests, VibeProof can
        process fulfillment and order information needed to determine the reviewed
        product and send a request to the purchaser.
      </p>
      <h2>How information is used</h2>
      <p>
        VibeProof uses this information to operate review collection and moderation,
        display approved reviews, identify purchase-linked reviews, deliver review
        requests when enabled, prevent abuse, provide merchant analytics, and maintain
        app security. AI demo reviews are stored separately from genuine customer
        reviews and do not contribute to public ratings.
      </p>
      <h2>Storage and service providers</h2>
      <p>
        Application and database infrastructure can be hosted on Railway. Customer
        review media is stored in private object storage and delivered using temporary
        access links. If a merchant enables review-request email or AI features,
        additional processors can be used for those optional features.
      </p>
      <h2>Retention and deletion</h2>
      <p>
        VibeProof responds to Shopify privacy and redaction webhooks. Customer review
        data associated with a valid redaction request is deleted, including matching
        stored review media where applicable. Store data is deleted following
        Shopify&apos;s shop-redaction process after uninstall.
      </p>
      <h2>Merchant responsibilities</h2>
      <p>
        Merchants control which review fields are collected and are responsible for
        presenting any notices or obtaining any permissions required for their use of
        review data under applicable law.
      </p>
      <h2>Questions</h2>
      <p>
        For privacy questions about a review or a store using VibeProof, contact the
        merchant through that store&apos;s normal support or privacy contact channel.
      </p>
    </main>
  );
}

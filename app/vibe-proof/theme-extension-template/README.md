# VibeProof theme extension template

These files are the implementation for the VibeProof Theme App Extension.

Shopify requires theme app extensions to be scaffolded with Shopify CLI. From the
app root, run:

```bash
shopify app generate extension
```

Choose **Theme app extension** and name it **vibeproof-reviews**. Then apply the
prepared VibeProof files:

```bash
bash scripts/apply-theme-extension-template.sh
```

The prepared extension includes:

- Rating bar app block
- Social review feed app block
- Review submission form app block
- Responsive social-style CSS
- Storefront JavaScript using the authenticated `/apps/vibeproof` app proxy

The public API only returns approved genuine reviews. `AI_DEMO`, `TEST`,
pending, and rejected content never appears in the storefront feed or public rating.

Media display is already supported for ReviewMedia URLs. Direct customer file
upload still requires a production object-storage provider and is intentionally
not faked by this template.

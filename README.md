# VibeProof

I built VibeProof to make product reviews feel more like the social content shoppers already browse. I worked on both the merchant tools and the storefront experience.

I included review collection and moderation, appearance settings, review request workflows, and storefront blocks for ratings, feeds, and galleries. I kept generated preview reviews separate from genuine customer reviews so they do not change real ratings or verified purchase status.

## Built with

I used TypeScript, React Router, Prisma, and Shopify theme extensions.

## Inside the project

* `app/vibe-proof/app/`: the merchant app and server routes.
* `app/vibe-proof/extensions/`: storefront review blocks.
* `app/vibe-proof/prisma/`: database schema and migrations.
* `docs/`: architecture and data model notes.

## Running it

I work from `app/vibe-proof`. I follow its README to install dependencies, configure my own development app and database, and start the development server.

I keep local account sessions, store data, and credentials out of this portfolio copy. My earlier planning notes are in the separate [VibeProof repository](https://github.com/2MilinEcom/VibeProof).

## More detail

* [Application setup](app/vibe-proof/README.md)
* [Architecture](docs/architecture.md)
* [Data model](docs/data-model.md)

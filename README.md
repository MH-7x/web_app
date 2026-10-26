This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

```
web_app
├─ AGENTS.md
├─ app
│  ├─ ads
│  │  ├─ facebook
│  │  │  └─ page.tsx
│  │  └─ page.tsx
│  ├─ api
│  │  ├─ ads
│  │  │  ├─ facebook
│  │  │  │  └─ route.ts
│  │  │  └─ [id]
│  │  │     └─ route.ts
│  │  ├─ content
│  │  │  ├─ blog
│  │  │  │  └─ route.ts
│  │  │  ├─ faq
│  │  │  │  └─ route.ts
│  │  │  ├─ gbp
│  │  │  │  └─ route.ts
│  │  │  ├─ meta
│  │  │  │  └─ route.ts
│  │  │  └─ [id]
│  │  │     └─ route.ts
│  │  ├─ gbp-connect
│  │  │  ├─ callback
│  │  │  │  └─ route.ts
│  │  │  └─ route.ts
│  │  ├─ gbp-posts
│  │  │  ├─ approve
│  │  │  │  └─ route.ts
│  │  │  ├─ export
│  │  │  │  └─ route.ts
│  │  │  ├─ generate
│  │  │  │  └─ route.ts
│  │  │  ├─ jobs
│  │  │  │  └─ [jobId]
│  │  │  │     └─ route.ts
│  │  │  ├─ publish
│  │  │  │  └─ route.ts
│  │  │  └─ [id]
│  │  │     ├─ regenerate
│  │  │     │  └─ route.ts
│  │  │     └─ route.ts
│  │  ├─ humanizer
│  │  │  ├─ approve
│  │  │  │  └─ route.ts
│  │  │  ├─ content
│  │  │  │  └─ route.ts
│  │  │  ├─ items
│  │  │  │  └─ route.ts
│  │  │  ├─ process
│  │  │  │  └─ route.ts
│  │  │  └─ save
│  │  │     └─ route.ts
│  │  ├─ keywords
│  │  │  ├─ route.ts
│  │  │  └─ [id]
│  │  │     ├─ import
│  │  │     │  └─ route.ts
│  │  │     └─ route.ts
│  │  ├─ proposals
│  │  │  ├─ route.ts
│  │  │  └─ [id]
│  │  │     ├─ convert
│  │  │     │  └─ route.ts
│  │  │     ├─ generate
│  │  │     │  └─ route.ts
│  │  │     └─ route.ts
│  │  ├─ reports
│  │  │  └─ generate
│  │  │     └─ route.ts
│  │  ├─ seo
│  │  │  ├─ audit
│  │  │  │  ├─ route.ts
│  │  │  │  └─ [jobId]
│  │  │  │     ├─ route.ts
│  │  │  │     └─ speed
│  │  │  │        └─ route.ts
│  │  │  ├─ export
│  │  │  │  └─ route.ts
│  │  │  └─ history
│  │  │     └─ route.ts
│  │  └─ settings
│  │     ├─ api-keys
│  │     │  ├─ route.ts
│  │     │  └─ test
│  │     │     └─ route.ts
│  │     ├─ business
│  │     │  └─ route.ts
│  │     ├─ models
│  │     │  └─ route.ts
│  │     └─ prompts
│  │        └─ [name]
│  │           ├─ reset
│  │           │  └─ route.ts
│  │           ├─ route.ts
│  │           └─ test
│  │              └─ route.ts
│  ├─ clients
│  │  ├─ export
│  │  │  └─ route.ts
│  │  ├─ new
│  │  │  └─ page.tsx
│  │  ├─ page.tsx
│  │  └─ [id]
│  │     ├─ edit
│  │     │  └─ page.tsx
│  │     └─ page.tsx
│  ├─ content
│  │  └─ page.tsx
│  ├─ error.tsx
│  ├─ favicon.ico
│  ├─ gbp-posts
│  │  └─ page.tsx
│  ├─ globals.css
│  ├─ humanizer
│  │  └─ page.tsx
│  ├─ keywords
│  │  └─ page.tsx
│  ├─ layout.tsx
│  ├─ not-found.tsx
│  ├─ page.tsx
│  ├─ proposals
│  │  ├─ new
│  │  │  └─ page.tsx
│  │  ├─ page.tsx
│  │  └─ [id]
│  │     ├─ edit
│  │     │  └─ page.tsx
│  │     └─ page.tsx
│  ├─ reports
│  │  └─ page.tsx
│  ├─ seo
│  │  └─ page.tsx
│  └─ settings
│     └─ page.tsx
├─ components
│  ├─ ads
│  │  ├─ facebook-panel.tsx
│  │  ├─ parts.tsx
│  │  ├─ use-ads-generator.ts
│  │  └─ workspace.tsx
│  ├─ breadcrumb.tsx
│  ├─ category-badge.tsx
│  ├─ client-avatar.tsx
│  ├─ client-form.tsx
│  ├─ client-selector.tsx
│  ├─ clients
│  │  ├─ message-builder.tsx
│  │  └─ setup-progress.tsx
│  ├─ clients-filters.tsx
│  ├─ coming-soon.tsx
│  ├─ content
│  │  ├─ blog-panel.tsx
│  │  ├─ faq-panel.tsx
│  │  ├─ gbp-panel.tsx
│  │  ├─ markdown.tsx
│  │  ├─ meta-panel.tsx
│  │  ├─ parts.tsx
│  │  ├─ use-generator.ts
│  │  └─ workspace.tsx
│  ├─ copy-button.tsx
│  ├─ delete-client-dialog.tsx
│  ├─ empty-state.tsx
│  ├─ gbp
│  │  ├─ calendar-workspace.tsx
│  │  ├─ disconnect-button.tsx
│  │  ├─ generate-wizard.tsx
│  │  ├─ post-detail.tsx
│  │  └─ publish-actions.tsx
│  ├─ history-item.tsx
│  ├─ humanizer
│  │  ├─ batch-mode.tsx
│  │  ├─ parts.tsx
│  │  ├─ paste-mode.tsx
│  │  └─ workspace.tsx
│  ├─ keywords
│  │  ├─ import-dialog.tsx
│  │  ├─ keyword-table.tsx
│  │  ├─ summary-cards.tsx
│  │  └─ workspace.tsx
│  ├─ proposals
│  │  ├─ project-form.tsx
│  │  ├─ proposal-document.tsx
│  │  ├─ proposal-view.tsx
│  │  ├─ row-actions.tsx
│  │  └─ status-badge.tsx
│  ├─ reports
│  │  └─ workspace.tsx
│  ├─ seo
│  │  ├─ audit-log.tsx
│  │  ├─ audit-runner.tsx
│  │  ├─ delete-audit.tsx
│  │  ├─ findings-list.tsx
│  │  ├─ report-view.tsx
│  │  ├─ score-ring.tsx
│  │  ├─ speed-picker.tsx
│  │  └─ start-audit-button.tsx
│  ├─ settings
│  │  ├─ api-keys-tab.tsx
│  │  ├─ general-tab.tsx
│  │  ├─ prompts-tab.tsx
│  │  └─ workspace.tsx
│  ├─ sidebar.tsx
│  ├─ skeletons.tsx
│  ├─ theme-toggle.tsx
│  ├─ topbar.tsx
│  └─ ui
│     ├─ alert-dialog.tsx
│     ├─ badge.tsx
│     ├─ button.tsx
│     ├─ card.tsx
│     ├─ dialog.tsx
│     ├─ input.tsx
│     ├─ popover.tsx
│     └─ sonner.tsx
├─ components.json
├─ eslint.config.mjs
├─ lib
│  ├─ actions.ts
│  ├─ activity.ts
│  ├─ ads-api.ts
│  ├─ ads-types.ts
│  ├─ audit
│  │  ├─ browser.ts
│  │  ├─ checks
│  │  │  ├─ crawlhealth.ts
│  │  │  ├─ geo.ts
│  │  │  ├─ index.ts
│  │  │  ├─ links.ts
│  │  │  ├─ local.ts
│  │  │  ├─ multilingual.ts
│  │  │  ├─ onpage.ts
│  │  │  ├─ performance.ts
│  │  │  ├─ social.ts
│  │  │  ├─ technology.ts
│  │  │  ├─ usability.ts
│  │  │  └─ util.ts
│  │  ├─ config.ts
│  │  ├─ crawl-types.ts
│  │  ├─ crawler.ts
│  │  ├─ crux.ts
│  │  ├─ engine.ts
│  │  ├─ extract.ts
│  │  ├─ groups.ts
│  │  ├─ imageinfo.ts
│  │  ├─ jobs.ts
│  │  ├─ keywords.ts
│  │  ├─ lighthouse.ts
│  │  ├─ log.ts
│  │  ├─ net.ts
│  │  ├─ phones.ts
│  │  ├─ report.ts
│  │  ├─ robots.ts
│  │  ├─ site-probes.ts
│  │  ├─ text.ts
│  │  └─ types.ts
│  ├─ business-types.ts
│  ├─ client-schema.ts
│  ├─ clients.ts
│  ├─ constants.ts
│  ├─ content-api.ts
│  ├─ content-types.ts
│  ├─ dashboard.ts
│  ├─ db.ts
│  ├─ diff.ts
│  ├─ download.ts
│  ├─ env-file.ts
│  ├─ format.ts
│  ├─ gbp-api.ts
│  ├─ gbp-jobs.ts
│  ├─ gbp-posts-api.ts
│  ├─ gbp-posts-types.ts
│  ├─ gbp-posts.ts
│  ├─ gemini.ts
│  ├─ generators
│  │  ├─ ads.ts
│  │  ├─ content.ts
│  │  ├─ gbp-posts.ts
│  │  ├─ humanizer.ts
│  │  ├─ proposals.ts
│  │  └─ reports.ts
│  ├─ humanizer-patterns.ts
│  ├─ humanizer-store.ts
│  ├─ humanizer-types.ts
│  ├─ keyword-groups.ts
│  ├─ keyword-import.ts
│  ├─ keywords-types.ts
│  ├─ onboarding.ts
│  ├─ prompts
│  │  ├─ fb-examples.ts
│  │  ├─ gbp-examples.ts
│  │  ├─ humanizer.ts
│  │  ├─ proposal.ts
│  │  ├─ report.ts
│  │  ├─ sample-run.ts
│  │  ├─ shared.ts
│  │  ├─ store.ts
│  │  └─ templates.ts
│  ├─ proposal-text.ts
│  ├─ proposals-types.ts
│  ├─ proposals.ts
│  ├─ reports-types.ts
│  ├─ settings.ts
│  └─ utils.ts
├─ next.config.ts
├─ package.json
├─ PLAN.md.md
├─ pnpm-lock.yaml
├─ pnpm-workspace.yaml
├─ prisma
│  └─ schema.prisma
├─ prisma.config.ts
├─ public
│  ├─ file.svg
│  ├─ globe.svg
│  ├─ next.svg
│  ├─ proposal
│  │  └─ profile.jpg
│  ├─ vercel.svg
│  └─ window.svg
├─ README.md
└─ tsconfig.json

```
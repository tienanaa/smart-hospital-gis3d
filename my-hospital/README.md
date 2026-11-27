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

## Database API

The API uses the Supabase Data API. Configure `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_KEY` in `.env`; the key is only used by server-side code. Do not
commit `.env` or expose a secret/service-role key to the browser. The tables
must already exist in Supabase; their schema is described in
`../database/database.sql` and typed in `lib/db/database.types.ts`.

Start the app with `npm run dev`, then use `GET /api/v1/{resource}`. Available
resources are `vertices`, `edges`, `solids`, `faces`, `complexes`, `nodes`, and
`arcs`. Results are paginated with `page` (default `1`) and `limit` (default `50`,
maximum `100`), for example:

```text
/api/v1/vertices?page=1&limit=50
```

The response contains `data` and `pagination` (`page`, `limit`, `total`, and
`totalPages`). The Supabase client and schema types live in `lib/db`; the
resource allowlist lives in `lib/api`; query logic lives in `lib/repositories`;
Next.js route handlers live in `app/api`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

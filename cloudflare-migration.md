# Migrating The Garage to Cloudflare Pages

Your site is entirely static HTML/CSS/JS — no code changes are needed. The `_headers` file works identically on Cloudflare Pages. Supabase handles the backend and is unaffected.

---

## Step 1 — Push your code to GitHub (if not already)

Cloudflare Pages deploys from a Git repo.

1. Create a repo at https://github.com/new (name it `the-garage` or similar)
2. In your website folder, open a terminal and run:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/the-garage.git
   git push -u origin main
   ```

---

## Step 2 — Create a Cloudflare account

Go to https://dash.cloudflare.com/sign-up and create a free account.

---

## Step 3 — Deploy to Cloudflare Pages

1. In the Cloudflare dashboard, go to **Workers & Pages → Pages → Connect to Git**
2. Authorise GitHub and select your repo
3. On the build settings screen:
   - **Framework preset:** None
   - **Build command:** *(leave blank)*
   - **Build output directory:** `/` (or leave blank — your files are at the root)
4. Click **Save and Deploy**

Cloudflare will deploy in ~30 seconds and give you a `*.pages.dev` URL.

---

## Step 4 — Add a custom domain (optional)

In your Pages project → **Custom domains → Set up a custom domain**, then follow the DNS instructions. Free on all plans.

---

## Step 5 — Remove Netlify

Once you've confirmed the Cloudflare deployment works:
1. Update any DNS records pointing to Netlify to point to Cloudflare instead
2. Delete the site from your Netlify dashboard

---

## What stays the same

- All Supabase data, auth, and storage — unchanged
- Push notifications (Supabase Edge Functions) — unchanged  
- The `_headers` security file — Cloudflare Pages reads it natively
- Service worker / PWA — unchanged

## Folder rename

To rename your local folder from `Website` to `The Garage`:
1. Close Cowork
2. In Windows Explorer, rename `D:\Website` to `D:\The Garage`
3. Reopen Cowork and select the renamed folder when prompted

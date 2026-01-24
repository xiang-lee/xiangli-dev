# Xiang Li - Personal Site

Source for the xiangli.dev main site (multi-page static site). Includes Home / About / Projects / Notes.

## Local Development

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080` in the browser.

## Write Notes

1. Edit `notes.html` and update the note cards.
2. Update the "Recent Notes" list in `index.html` to keep the homepage in sync.

## Add Projects

1. Edit the "Featured Projects" section in `projects.html`.
2. Each card should include a name, short description, status tag, and optional link.

## Contact Info

- Email is shown in the Connect section of `index.html`.
- Replace the placeholder email with your real address.

## Deploy (Cloudflare Pages + GitHub)

1. Push this repo to GitHub: `https://github.com/xiang-lee/xiangli-dev`.
2. Cloudflare Dashboard -> Pages.
3. "Connect to Git" and authorize GitHub.
4. Choose repo `xiang-lee/xiangli-dev`.
5. Build settings:
   - Framework preset: None
   - Build command: leave empty
   - Build output directory: `.`
6. Deploy and wait for the build to finish.

## Custom Domain (xiangli.dev)

1. Cloudflare Pages project -> Custom domains -> Add custom domain.
2. Add `xiangli.dev`.
3. If DNS is hosted in Cloudflare:
   - Follow the prompt to add or update DNS records.
4. If DNS is hosted elsewhere:
   - Add the CNAME or A records shown by Cloudflare at your DNS provider.
5. Wait for SSL issuance (minutes to hours).

## Future Subdomain Apps

- `project1.xiangli.dev` and similar subdomains can be deployed as separate Pages projects.
- Each subdomain will need its own DNS record pointing to the new Pages project.

# Marin Century 2026 Raffle

A mobile-friendly raffle entry app for the Marin Century booth. Riders scan a QR code, fill out a short form, and get a confirmation email with a discount code.

## How it works

- **Frontend:** `index.html` + `styles.css` + `app.js`, hosted free on GitHub Pages.
- **Backend:** `Code.gs` runs as a Google Apps Script web app, writes entries to a Google Sheet, sends the confirmation email from `doug@marincyclists.com`.

No build step, no server, no hosting bill.

## One-time setup

### 1. Create the Google Sheet

1. Go to <https://sheets.new> while signed in as **doug@marincyclists.com**.
2. Rename the spreadsheet something like `Marin Century 2026 Raffle`.
3. Leave it empty — the script creates the `Entries` tab automatically on the first submission.

### 2. Add the Apps Script

1. In that Sheet: **Extensions → Apps Script**.
2. Delete the placeholder `function myFunction()` code.
3. Paste in the contents of `Code.gs` from this repo.
4. Click the save icon (or Ctrl/Cmd+S).

### 3. Deploy the script as a web app

1. Click **Deploy → New deployment**.
2. Click the gear icon and pick **Web app**.
3. Fill in:
   - **Description:** `Raffle v1`
   - **Execute as:** `Me (doug@marincyclists.com)`
   - **Who has access:** `Anyone`
4. Click **Deploy**.
5. Google will prompt for authorization — allow it. (You'll see a "this app isn't verified" screen; click Advanced → Go to [project name].)
6. Copy the **Web app URL** that ends in `/exec`.

### 4. Wire the frontend to the backend

1. Open `app.js`.
2. Replace `PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE` with the URL you just copied.
3. Commit the change.

### 5. Turn on GitHub Pages

1. In the GitHub repo: **Settings → Pages**.
2. Source: **Deploy from a branch**.
3. Branch: `main`, folder: `/ (root)`. Save.
4. Wait ~30 seconds. The site will be live at `https://<your-username>.github.io/<repo-name>/`.

### 6. Make the QR code

Use any free generator (e.g. <https://www.qr-code-generator.com>). Point it at the GitHub Pages URL from step 5. Print on your poster.

## Editing later

- **Form, copy, colors:** edit `index.html` / `styles.css` / `app.js` on GitHub, commit. Live in ~30 seconds.
- **Email copy, discount code, subject line:** edit `Code.gs` in the Apps Script editor. Then **Deploy → Manage deployments → pencil icon → Version: New version → Deploy**. Keep the same deployment so the URL doesn't change.

## Reading entries / picking a winner

Everything is in the Sheet. To draw a winner after the expo:

1. Open the Sheet, select the `Entries` tab.
2. Sort by `timestamp` ascending.
3. Remove duplicate emails keeping the earliest row: **Data → Data cleanup → Remove duplicates**, check only the `email` column.
4. To pick a winner randomly, add a column with `=RAND()`, sort by it, top row wins. Or use `=INDEX(B:B, RANDBETWEEN(2, COUNTA(B:B)))` in an empty cell to pull a random first name.

## File structure

```
index.html    # the entry form
styles.css    # Marin Century branding
app.js        # form submit + POST to Apps Script
Code.gs       # Apps Script backend (paste into script.google.com)
README.md     # this file
```

## Limits and notes

- **Email quota:** a Google Workspace account (doug@marincyclists.com) can send 1,500 `MailApp` emails per day. Consumer Gmail is 100/day. You will not hit this at a booth.
- **Concurrency:** `LockService` in `Code.gs` serialises writes, so two simultaneous submissions can't corrupt the Sheet.
- **Duplicates:** per spec, duplicates are allowed at entry time. Deduplicate manually in the Sheet before drawing (step above).
- **Discount code:** same code for everyone, hardcoded in `Code.gs`. Change once and redeploy.
- **Security:** the web app URL is public. That's fine — the only thing anyone can do is add a row to the Sheet. No secrets are exposed on the frontend.

## Testing checklist before the expo

- [ ] Submit a test entry on your phone. Confirm row lands in the Sheet with correct timestamp.
- [ ] Confirm the email arrives from `doug@marincyclists.com` and reads correctly.
- [ ] Check on an Android phone (Chrome) and an iPhone (Safari) — the site should look clean on both.
- [ ] Submit with mismatched emails → see validation error, form does not submit.
- [ ] Submit without filling a field → see validation error.
- [ ] Turn the phone to airplane mode mid-submit → see the "couldn't submit" error and be able to retry.
- [ ] Test scanning the printed QR code with at least two different phones.

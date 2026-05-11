---
name: football-staff-monthly
description: Refresh Football Tracker club staff on the 1st of each month
---

Run the Football Tracker club staff refresh by executing:

```
python3 "/Users/liam/Library/Mobile Documents/com~apple~CloudDocs/LPCMI/FootballTracker/scraping/refresh.py" staff
```

This scrapes staff data for all clubs across all master leagues (~450 HTTP requests, takes 20–30 min) and rebuilds + deploys all HTML pages. The final step also generates a contact-update review queue under `scans/pending-changes/<YYYY-MM>/`.

After the command finishes:

1. Confirm `refresh.py staff` exited cleanly.
2. Read the latest `scans/pending-changes/*/report.md` — pick the folder whose name matches this month (e.g. `2026-06`).
3. Reply to Liam with a one-line summary: total changes, broken down by club moves / role changes / departures, plus the count of ambiguous items.
4. Tell him: *"Reply when you want to walk through the review and I'll apply approvals straight to Contacts.app."* — when he comes back, run `python3 "/Users/liam/Library/Mobile Documents/com~apple~CloudDocs/LPCMI/FootballTracker/contacts/apply_changes.py" <run-id>` interactively.

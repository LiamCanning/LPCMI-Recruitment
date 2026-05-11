---
name: football-squads-jul
description: Refresh Football Tracker player squads — July 1 (summer transfer window)
---

Run the Football Tracker full squad refresh by executing:

```
python3 "/Users/liam/Library/Mobile Documents/com~apple~CloudDocs/LPCMI/FootballTracker/refresh.py" squads
```

This scans all GK, RB, and CF player profiles across 26 leagues (visits every player profile for contract data — takes 3–5 hours) and rebuilds + deploys all HTML pages. If the Mac was asleep and this job was skipped, just note that it will run at the next scheduled date. Check that the command completes without errors and report the outcome.
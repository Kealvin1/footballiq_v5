name: Snapshot Odds Every 2 Hours

# Free replacement for Netlify's billed scheduled-function feature.
# Runs on GitHub's infrastructure (free for public repos) and simply
# pings the existing snap-odds Netlify Function via HTTP every 2 hours.

on:
  schedule:
    - cron: '0 */2 * * *'
  workflow_dispatch:   # lets you trigger it manually from the Actions tab to test

jobs:
  snap-odds:
    runs-on: ubuntu-latest
    steps:
      - name: Call snap-odds function
        run: |
          echo "Pinging snap-odds endpoint..."
          curl -sf https://ftliq.netlify.app/.netlify/functions/snap-odds
          echo "Done."

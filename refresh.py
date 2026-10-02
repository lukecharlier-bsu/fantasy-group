"""One-command refresh: pull the current ESPN season and rebuild dashboard JSON.

Historical NFL.com data under output/<nflLeagueID>-history-* is never touched.
Run:
    python3 refresh.py
"""

import subprocess
import sys


def run(cmd):
    print(f"\n$ {' '.join(cmd)}")
    r = subprocess.run(cmd)
    if r.returncode != 0:
        print(f"!! {' '.join(cmd)} exited {r.returncode}")
        sys.exit(r.returncode)


def main():
    run([sys.executable, "scrapeESPN.py"])
    run([sys.executable, "buildDashboardData.py"])
    print("\nDone. docs/data.json is up to date.")


if __name__ == "__main__":
    main()

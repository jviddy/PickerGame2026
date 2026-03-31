AGENTS.md
Project Overview

This is a static-site-based fantasy football-style competition platform (PickerGame) where users select teams and earn points based on real-world match results.

The system includes:

Entry form
Leaderboard (multiple views)
Match schedule and results
Scoring engine that processes results files
Core Principles
Keep the solution simple and maintainable
Prefer static generation over complex backends
Minimise dependencies unless clearly justified
Optimise for clarity and ease of manual updates
Critical Rules
Ignore Archive Folder
DO NOT read, modify, or reference anything inside /archive
Treat /archive as deprecated legacy content
Only use it if the user explicitly instructs you to
Tech & Approach
Prefer simple web stack (HTML, CSS, minimal JS or lightweight framework)
Avoid unnecessary frameworks unless required
Output should be easy to deploy as a static site
Data Handling
Results data will be manually edited (often via GitHub web or mobile)
Therefore:
Use human-readable formats (JSON or simple CSV)
Keep files short and split logically (e.g. by round or date)
Avoid deeply nested or complex structures
Scoring Engine
Must be:
Deterministic
Easy to rerun
Independent of UI
Input: results files
Output: updated scores / leaderboard data
File Structure Guidance
Keep structure flat and predictable
Separate clearly:
Data (e.g. /data)
Logic (e.g. /scripts)
UI (e.g. /site)
Coding Style
Prefer readability over cleverness
Use small, focused functions
Avoid over-engineering
Comment where logic is non-obvious
Commands & Execution
Prefer file-scoped operations where possible
Avoid running full builds unless necessary
Do not install packages or change dependencies without approval
Safety & Permissions

Allowed without asking:

Reading files
Editing existing files
Creating new files within project structure

Ask before:

Installing packages
Deleting files
Changing project structure significantly
When Unsure
Choose the simplest working solution
Ask for clarification rather than guessing
Optimise for maintainability over cleverness
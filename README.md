**Under construction. It currently adds all the RTM tasks you've created in the past week to HabitRPG and does not add duplicates anymore.**

Read the plan at: https://trello.com/card/remember-the-milk/50e5d3684fe3a7266b0036d6/21. And see issue #1.

HabitRPG Todo Synchronization
=============================

This is a quick-and-dirty tool (currently planned to be a command line-only tool) to get Remember the Milk tasks into HabitRPG and track updates to both each time it's run. It isn't intended to be feature-complete, useful for everyone, or robust. But it is intended to work.

Installation
============

Clone the repo and run `npm install`, `chmod +x main.js`, then `./main.js`. That works at least.

Usage
=====
`./main.js`

If all else fails, `node main.js`. Put environment variables in front. In development, you might do something like:

`HRPG_USER_ID="123-456-789" HRPG_API_TOKEN="123-456-789" DEBUG_MODE=1 ./main.js` (that's what I usually do)

Environment variables
---------------------
These generally override anything else the app would try to find out.

- `HRPG_USER_ID`: Set the `x-api-user` instead of getting it from `.habitrpgrc` — *good for development*
- `HRPG_API_TOKEN`: Set the `x-api-key` instead of getting it from `.habitrpgrc` — *good for development*
- `DEBUG_MODE`: Set to `1` to use `http://localhost:3000` instead of `https://habitrpg.com`
- `BETA_MODE`: Set to `1` to use `https://beta.habitrpg.com` instead of `https://habitrpg.com`. Note that `DEBUG_MODE` is stronger than this.
- `DRY_RUN`: Set to any truthy value. Don't do any mutative (is that a word?) API operations. Still performs read-only operations. **Note that dry run mode still goes through the authentication sequence for Remember the Milk and writes your credentials to a file. It would be fairly useless if it didn't do this.** It does not write the marker file for last sync, since this would actually change behavior on the next run.
- `FULL_SYNC`: Set to `1` to sync **all** Remember the Milk tasks instead of just those added within the last week. It goes without saying that this may take a while.
- `FORCE`: Run non-interactively. Simply setting this (even `FORCE=`) is enough. *Try to avoid doing this. The prompts are in there for a good reason.*
- `FROB`: ...internal use only, implementation detail etc. etc.. Basically, if the app gives you an auth URL and you exit out of the app before it authenticates you, but you authorize it on the RTM side, you can copy the `frob` from the query string and provide it on the command line. This will skip getting a new one from the API.

Roadmap
=======

I hope this kind of functionality makes it into HabitRPG itself. This is intended as a stopgap, but if people like it, maybe I'll work on it more. Maybe. Civilized requests will get infinitely more attention than entitled flaming.

Complaining about the license is fine. Since it's free, I figured it ought to stay that way even if worked on by others. Give me some compelling reasons, and I'll consider relicensing.

Legal
=====
Remember the Milk wants me to tell you that: "This product uses the Remember The Milk API but is not endorsed or certified by Remember The Milk." So take heed.

HabitRPG Todo Synchronization
=============================
*Like my stuff and want to see more of it? Pledge me a quarter on Gittip :) [https://www.gittip.com/wizonesolutions](https://www.gittip.com/wizonesolutions)*

This is a quick-and-dirty tool (currently planned to be a command line-only tool) to get Remember the Milk tasks into HabitRPG and track updates to both each time it's run. It isn't intended to be feature-complete, useful for everyone, or robust. But it is intended to work.

### So what does it actually do?
1. Grabs all your HabitRPG tasks for comparison purposes.
1. Grabs all your Remember the Milk tasks (taking into account last time it synchronized and if you have passed `--full-sync` or not).
1. Now everything happens asynchronously:
1. Adds new, incomplete tasks from Remember the Milk. The first time you sync, it only grabs the past week, and it only grabs incomplete tasks. Use `--full-sync` in the environment variables to do a full synchronization.
1. Deletes any tasks that have been deleted on the Remember the Milk side, but it doesn't do the same for tasks only deleted on the HabitRPG side.
1. Completes tasks on the Remember the Milk side if they have been completed since last synchronization on the HabitRPG side.

So it's not a true two-way synchronization yet, but it does the job and lets your tasks live in HabitRPG. I recommend deleting them from Remember the Milk and doing a synchronization if you want to delete one. If you want to track one in RTM only, then just delete it from HabitRPG. It might get synchronized again when you change it or complete recurring tasks, etc. in Remember the Milk.

Installation
============
Easiest: `npm install -g habitrpg-todo-sync`

For development: Clone the repo and run `npm install && npm link`

Usage
=====
`habitsync` (`habitrpg-todo-sync` also works now)

The first time you run, the app will help you get authenticated with both services. You need accounts on both, of course.

For development, `[auth-dev]` is used if in `.habitrpgrc`, but `[auth-beta]` is not supported because the beta server uses the same DB as the live one.

Command-line Options (courtesy of the Node.js module optimist!)
---------------------
These generally override anything else the app would try to find out.

In development, you might do something like:

`habitsync --dev -v` (that's what I usually do)

Options:

- `--filter`: This works exactly like Remember the Milk's search box. Have tasks you don't want to import into HabitRPG? Use `--filter='Your criteria'`. For example, import only from a specific list or smart list with `--filter='list:"List Name"'`. See their documentation at https://www.rememberthemilk.com/help/?ctx=basics.search.advanced. Note the following: Even when you specify a filter, *any* task you delete in Remember the Milk will be deleted in HabitRPG if it exists. We have to ask RTM for changes without the filter to be able to do that at all.
- `-q, --silence, --SILENCE`: Run silently, except for errors. Intended for use with `cron` so that it doesn't mail you every time (unless you want it to). For extra fun, use `habitsync --force --SILENCE`. Fun to type, but useless since **-q implies -f**.
- `-f, --force`: Run non-interactively. *Try to avoid doing this. The prompts are in there for a good reason.*
- `--beta`: Use `https://beta.habitrpg.com` instead of `https://habitrpg.com`. Note that `--dev` is stronger than this.
- `-n, --dry-run`: Don't do any mutative (is that a word?) API operations. Still performs read-only operations. **Note that dry run mode still goes through the authentication sequence for Remember the Milk and writes your credentials to a file. It would be fairly useless if it didn't do this.** It does not write the marker file for last sync, since this would actually change behavior on the next run.
- `-v, --debug, --verbose`: Show more verbose output. Also currently works with the `node-habit` and `rtmnode` modules bundled in `node_modules`, though I might take it out when I release them separately. - *good for development*
- `--dev`: Use `http://localhost:3000` instead of `https://habitrpg.com`
- `-a, --full-sync`: Sync **all** Remember the Milk tasks instead of just those added within the last week. Use `--filter` to restrict the scope of this. This takes slightly longer, but it's actually not too bad.
- `-u, --user-id`: Set the `x-api-user` instead of getting it from `.habitrpgrc` — *good for development*
- `-p, --api-key`: Set the `x-api-key` instead of getting it from `.habitrpgrc` — *good for development*
- `--frob`: ...internal use only, implementation detail etc. etc.. Basically, if the app gives you an auth URL and you exit out of the app before it authenticates you, but you authorize it on the RTM side, you can copy the `frob` from the query string and provide it on the command line. This will skip getting a new one from the API.

Roadmap
=======
Originally, my next goals were:

- Ignore recurring tasks.
- Complete tasks in Habit when they have been completed on the remote end.

...but actually these don't bother me much, so the roadmap is going to be more organic.

I hope this kind of functionality makes it into HabitRPG itself. This is intended as a stopgap, but if people like it, maybe I'll work on it more. Maybe. Civilized requests will get infinitely more attention than entitled flaming.

Complaining about the license is fine. Since it's free, I figured it ought to stay that way even if worked on by others. Give me some compelling reasons, and I'll consider relicensing.

Legal
=====
Remember the Milk wants me to tell you that: "This product uses the Remember The Milk API but is not endorsed or certified by Remember The Milk." So take heed.

Original idea: Read the plan at: https://trello.com/card/remember-the-milk/50e5d3684fe3a7266b0036d6/21.

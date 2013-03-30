#!/usr/bin/env node

var TODO_SOURCE_RTM = "rtm"; // I hate long variable names, but one must do what one must do.

var iniReader = require('inireader');

var parser = new iniReader.IniReader(),
  fs = require('fs'),
  path = require('path'),
  http = require('http'),
  https = require('https'),
  zlib = require('zlib'),
  RtmNode = require('rtmnode'),
  prompt = require('prompt'),
  request = require('superagent'),
  url = require('url'),
  util = require('util'),
  moment = require('moment'),
  HabitRpg = require('node-habit'),
  _ = require('underscore');

var hrpgConfigPath = path.resolve(path.join(process.env.HOME, '.habitrpgrc'));

var debugMode = process.env.DEBUG_MODE == "1" ? true : false;
var betaServer = process.env.BETA_MODE == "1" ? true : false;
var mode = debugMode ? "debug" : "production";

var requestStuff = {
  host: debugMode ? 'localhost' : betaServer ? 'beta.habitrpg.com' : 'habitrpg.com',
  port: debugMode ? 3000 : 443,
  protocol: debugMode ? 'http' : 'https',
  path: "/api/v1/user/tasks"
};

var habitResponse;

if (process.env.FORCE === undefined) {
  prompt.start();

  var properties = [
    {
      name: 'okToContinue',
      type: 'string'
    }
  ];

  console.log("You are about to synchronize tasks between HabitRPG and Remember the Milk.\n\nMode: " + mode + "\n" +
              "Server: " + requestStuff.host + "\n" +
              "Port: " + requestStuff.port + "\n\n" +

              "If this is OK with you, type the word yes in full");
  prompt.get(properties, function(err, result) {
    if (err) { return onErr(err); }

    if (result.okToContinue == "yes")  {
      startSync();
    }
  }); } else {
  startSync();
}

function startSync() {
  console.log('Now syncing with ' + requestStuff.host + '...');

  var hrpgAuth = {};
  if (fs.existsSync(hrpgConfigPath)) {
    // TODO: If we set HRPG_USER_ID and HRPG_API_TOKEN in the environment, skip
    // the INI parsing. Useful for dev mode or multiple accounts.
    if (process.env.HRPG_USER_ID && process.env.HRPG_API_TOKEN) {
      console.log("Using HabitRPG credentials from the environment instead of reading ~/.habitrpgrc.");
      hrpgAuth = {
        user_id: process.env.HRPG_USER_ID,
        api_token: process.env.HRPG_API_TOKEN
      };
    } else {
      ////// START HABIT //////
      parser.load(hrpgConfigPath);

      hrpgAuth = {
        user_id: parser.param('auth.user_id'),
        api_token: parser.param('auth.api_token')
      };
    }

    habitRequestPath = requestStuff.protocol + '://' + requestStuff.host + ':' + requestStuff.port + requestStuff.path;

    // Oh, we're going to do stuff like this again later.
    var habitapi = new HabitRpg(hrpgAuth.user_id, hrpgAuth.api_token, requestStuff.protocol + '://' + requestStuff.host + ':' + requestStuff.port);

    // TODO: Need to write HabitRpg.getAllTasks() and use that instead of doing it manually here
    request.get(habitRequestPath)
      .query({type: 'todo'})
      .type('application/json')
      .set('Accept: gzip, deflate')
      .set('x-api-user', hrpgAuth.user_id)
      .set('x-api-key', hrpgAuth.api_token)
      .end(function(res) {
        if (res.ok) {
          res.text = JSON.parse(res.text);

          console.log("Got response: " + res.status);

          // console.log(util.inspect(res.text));

          habitResponse = moo(res.text); // I don't think Habit does this, but just in case. Also, I like calling moo().

          console.log('Finished getting HabitRPG tasks.');
          console.log("Let's grab the Remember the Milk tasks now. We'll restrict it to those created within the last week for now. First, we have to make sure we're authenticated...");
          ///// START RTM //////

          // If we have the token, then first just grab all the tasks in their Inbox.
          // Delay all API calls by 1 second.

          // OK, let's see what RTM says I have to do...OK, first I need a signing function. I sign my requests with this.
          var tempRtmCreds = {
            apiKey: "1cca74e8b073112b8e5975ec3d797e1a",
            sharedSecret: "a253e6102be98e1d"
          };

          var rtmapi = new RtmNode(tempRtmCreds.apiKey, tempRtmCreds.sharedSecret);

          tempRtmCreds.authToken = "";
          // TODO: Check for a stored auth token. Do the following if we don't have it.
          if (fs.existsSync(path.join(process.env.HOME, '.htsrtmtoken.json'))) {
            tempRtmCreds.authToken = fs.readFileSync(path.join(process.env.HOME, '.htsrtmtoken.json')).toString();
          }

          if (tempRtmCreds.authToken) {
            // Do a check to make sure it works also. Because it might have expired.
            rtmapi.checkToken(tempRtmCreds.authToken, function(result) {
              if (result) {
                rtmContinue(habitapi, rtmapi, tempRtmCreds.authToken);
              } else {
                console.log("ACTION NEEDED: Looks like our authorization has expired. This happens sometimes; no big deal. I'm going to take you through the authentication process again now.");
                authorizeRtm(habitapi, rtmapi);
              }
            });

            // Get tasks and stuff
          } else {
            authorizeRtm(habitapi, rtmapi);
          }
          ///// END RTM //////
        } else {
          console.log("Got error: " + util.inspect(res.status) + ", " + util.inspect(res.header));
        }
    });
    ////// END HABIT //////
  } else {
    console.log("Please create a file called .habitrpgrc in your home directory.\n\n" +

                "In it, put this:\n\n" +

                "[auth]\n" +
                "user_id = (your HabitRPG user ID)\n" +
                "api_token = (your HabitRPG API token)\n\n" +

                "You can find these on your HabitRPG settings page.");
    return;
  }
}

function authorizeRtm(habitapi, rtmapi) {
  // OK, wait, before the signing function, let's actually make something to sign.
  // Looks like the first thing I need is a frob. Uhh...oh wait, I need a way to call methods! I'll just do it straight up in the class to start and refactor later, maybe.
  existingFrob = undefined;
  skipSiteAuth = false;
  if (process.env.FROB !== undefined) {
    existingFrob = process.env.FROB;
    skipSiteAuth = true;
  }

  if (!skipSiteAuth) {
    console.log('Existing frob: ' + existingFrob);
    // TODO: Don't need existingFrob anymore. It was to avoid branching here.
    // Now I have, so kill it some itme.
    rtmapi.getFrob(existingFrob, function(theFrob) {
      // We have frob. Umm, so now what? Oh, OK. We have to build an
      // authentication URL. This is pretty easy.
      var authUrl = rtmapi.getAuthUrl(theFrob);
      console.log("\n" +
                  'Go here and authorize this app: ' + "\n\n" +

                  authUrl + "\n\n" +

                  "I'll wait. Just press enter when you're done or if you've already authorized and provided the frob as an environment variable (looking at you @wizonesolutions).");
      prompt.start();
      prompt.get("dummyEnter", function(err, result) {
        if (err) { return onErr(err); }
        onReturnFromRtmSite(habitapi, rtmapi, theFrob);
      });
    });
  } else {
    console.log("WARNING: Skipping site authentication due to frob being provided on command line. This might send you into a callback loop. Press Ctrl+C if that happens.");
    onReturnFromRtmSite(habitapi, rtmapi, existingFrob);
  }
}

function onReturnFromRtmSite(habitapi, rtmapi, theFrob) {
  rtmapi.getToken(theFrob, function(authToken) {
    if (!authToken) {
      console.log("ERROR: Looks like authentication didn't work out. No big deal. Let's try again.");
      // TODO: If they do this a lot, will the stack get too big? Unlikely to happen though, so I'm not going to think too hard about it...
      authorizeRtm(habitapi, rtmapi);
      return;
    }

    // Save the auth token, yeah?
    console.log("Saving your auth token so you won't have to do this again for a while...");
    fs.writeFileSync(path.join(process.env.HOME, '.htsrtmtoken.json'), authToken);
    rtmContinue(habitapi, rtmapi, authToken);
  });
}

function rtmContinue(habitapi, rtmapi, authToken) {
  rtmapi.setAuthToken(authToken);
  console.log("Alright, we're all good on the authentication front. Let's continue grabbing those tasks.");

  // TODO: Test that lastSync works when there is no file
  lastSync = undefined;
  filter = 'addedWithin:"1 week of today"';

  // For the brave
  if (process.env.FULL_SYNC == "1") {
    filter = undefined;
    lastSync = undefined;
  } else {
    // Figure out when we last synced.
    // TODO: Try combining this stuff floating around into one file. Either .habitrpgrc or my own.
    if (fs.existsSync(path.join(process.env.HOME, '.htsrtmlastsync'))) {
      lastSync = fs.readFileSync(path.join(process.env.HOME, '.htsrtmlastsync')).toString();
      filter = undefined; // filter messes us up if we actually have a last_sync.
    }
  }

  console.log('We last synchronized on ' + lastSync);

  // For additional fun and profit (JUST KIDDING REMEMBER THE MILK; IT'S
  // STRICTLY ONLY FOR FUN), let's massage the Habit task data a little bit.
  var habitTaskMap = massageHabitTodos(habitResponse);

  if (!process.env.DRY_RUN) {
    // TODO: Abstract path to this file. Quit duplicating code.
    fs.writeFileSync(path.join(process.env.HOME, '.htsrtmlastsync'), moment().format());
  } else {
    console.log("DRY RUN: Not writing lastSync time to file.");
  }

  rtmapi.getTasks(undefined, filter, lastSync, function(response) {
    // TODO: I would update the lastSync here

    // console.log(util.inspect(response.tasks));
    response.tasks = moo(response.tasks);
    response.tasks.every(function(item) {
      if (item === undefined) { return true; }

      item.list = moo(item.list);

      item.list.every(function(list) {
        if (list === undefined) { return true; }
        // console.log('taskseries for ' + item.id + ': ' + util.inspect(item.taskseries));

        // We're pretty much done here, so it's fine for this to be async. I
        // think. It's probably going to say it's done too soon, but whatevs.

        list.taskseries = moo(list.taskseries);

        list.taskseries.every(function(taskseries) {
          if (taskseries === undefined) { return true; }
          // Add it.
          if (habitTaskMap && habitTaskMap[TODO_SOURCE_RTM] && habitTaskMap[TODO_SOURCE_RTM][taskseries.id]) {
            console.log('Skipping existing task: ' + taskseries.name);
          } else {
            if (!process.env.DRY_RUN) {
              habitapi.addTask('todo', taskseries.name, {hts_external_id: taskseries.id, hts_external_source: TODO_SOURCE_RTM});
            } else {
              console.log('Dry run summary: Would add "' + taskseries.name + '". The API would tell us something like:' + "\n\n" +
                          util.inspect({
                            type: "todo",
                            text: taskseries.name,
                            id: "not available in dry run mode",
                            hts_external_id: taskseries.id,
                            hts_external_source: TODO_SOURCE_RTM
              }));
            }
          }
        });
        if (list.deleted) {
          list.deleted = moo(list.deleted);

          list.deleted.every(function(deleted) {
            if (deleted === undefined) { return false; }
            deleted.taskseries = moo(deleted.taskseries);
            deleted.taskseries.every(function(taskseries) {
              // TODO: OMG PUT THIS IN A VARIABLE STOP DUPING A TWO-LEVEL DEEP OBJECT
              // This comment left way too late at night
              if (habitTaskMap && habitTaskMap[TODO_SOURCE_RTM] && habitTaskMap[TODO_SOURCE_RTM][taskseries.id]) {
                console.log('Deleting task: ' + habitTaskMap[TODO_SOURCE_RTM][taskseries.id].text);
                if (!process.env.DRY_RUN) {
                  habitapi.deleteTask(habitTaskMap[TODO_SOURCE_RTM][taskseries.id].id);
                }
                console.log('Dry run, so not really deleting. Would delete Habit task ' + habitTaskMap[TODO_SOURCE_RTM][taskseries.id].id + ', called ' + habitTaskMap[TODO_SOURCE_RTM][taskseries.id].text);
              } else {
                console.log("We have no record of task " + taskseries.id + ', so doing nothing.');
              }
              return true;
            });
            return true;
          });
        }
        return true;
      });
      return true;
    });
  });
}

function onErr(err) {
  console.log(err);
  return 1;
}

function massageHabitTodos(habitResponse) {
  var massagedHabit = {};

  // So, this is is pretty simple. Pretty sure we have an array at this point?
  habitResponse.every(function(item) {
    // Skip non-external tasks.
    if (item.hts_external_source) {
      // We want to sort them by service, then ID. So:
      massagedHabit[item.hts_external_source] = massagedHabit[item.hts_external_source] || {};
      massagedHabit[item.hts_external_source][item.hts_external_id] = item;
    }

    return true;
  });

  return massagedHabit;
}

// Looking at you, RTM's XML -> JSON conversion.
// (This puts an object into a single-element array if it isn't an array
// itself. Compensates for APIs that treat JSON like XML.)
function moo(element) {
  return !_.isArray(element) ? [element] : element;
}
var arrayify = moo;

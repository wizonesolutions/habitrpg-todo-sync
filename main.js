#!/usr/bin/env node

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
  });
}
else {
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
    }
    else {
      ////// START HABIT //////
      parser.load(hrpgConfigPath);

      hrpgAuth = {
        user_id: parser.param('auth.user_id'),
        api_token: parser.param('auth.api_token')
      };
    }

    habitRequestPath = requestStuff.protocol + '://' + requestStuff.host + ':' + requestStuff.port + requestStuff.path;
    console.log("HabitRPG request path: " + habitRequestPath);

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

          console.log("BODY: " + util.inspect(res.text));

          console.log('Finished getting HabitRPG tasks.');
          console.log("Let's grab the Remember the Milk tasks now. We'll restrict it to those created within the last week for now. First, we have to make sure we're authenticated...");
          // TODO: This is where I would continue with getting RTM tasks
          // TODO 2: Should really use a polling, event-based, or proper callback flow here. But don't have time right now
          ///// START RTM //////

          // TODO: Generate auth URL. Get user to go there and then come back and respond to some prompt when they have if we don't already have a valid auth token for them, then store the auth token in a file somewhere (probably the home directory).
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
            // TODO: Do a check to make sure it works also. Because it might have expired.
            rtmapi.checkToken(tempRtmCreds.authToken, function(result) {
              if (result) {
                rtmContinue(habitapi, rtmapi, tempRtmCreds.authToken);
              }
              else {
                console.log("ACTION NEEDED: Looks like our authorization has expired. This happens sometimes; no big deal. I'm going to take you through the authentication process again now.");
                authorizeRtm(habitapi, rtmapi);
              }
            });

            // Get tasks and stuff
          }
          else {
            authorizeRtm(habitapi, rtmapi);
          }
          ///// END RTM //////
        }
        else {
          console.log("Got error: " + util.inspect(res.status) + ", " + util.inspect(res.header));
        }
    });

    // TODO: Remove me soon
    /* httpCallback = debugMode ? https : http;

    // TODO: Use request() instead
    httpCallback.get(options, ).on('error', function(e) {
      console.log("Got error: " + e.message);
    }); */
    ////// END HABIT //////
  }
  else {
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

  // TODO: Branch. If skipSiteAuth then just show a skipping message, saying to Ctrl-C if it loops forever
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
  }
  else {
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
  rtmapi.getTasks(undefined, 'addedWithin:"1 week of today"', undefined, function(response) {
    // TODO: Process the tasks
    console.log(util.inspect(response.tasks));
    if (!_.isArray(response.tasks)) {
      response.tasks = [response.tasks];
    }
    response.tasks.forEach(function(item) {
      if (!_.isArray(item.list)) {
        item.list = [item.list];
      }

      item.list.forEach(function(list) {
        // console.log('taskseries for ' + item.id + ': ' + util.inspect(item.taskseries));

        // We're pretty much done here, so it's fine for this to be async. I
        // think. It's probably going to say it's done too soon, but whatevs.

        if (!_.isArray(list.taskseries)) {
          list.taskseries = [list.taskseries];
        }

        list.taskseries.forEach(function(taskseries) {
          // Add it.
          // TODO: Don't duplicate tasks
          habitapi.addTask('todo', taskseries.name, {notes: 'Some fancy string with RTM data will go here'});

          if (taskseries.name === undefined) {
            console.log('Undefined? ' + util.inspect(item));
          }
        });
      });
    });
  });
}

function onErr(err) {
  console.log(err);
  return 1;
}

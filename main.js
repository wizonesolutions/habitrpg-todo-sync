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
  _ = require('underscore');

var hrpgConfigPath = path.resolve(path.join(process.env.HOME, '.habitrpgrc'));

var debugMode = process.env.DEBUG_MODE == "1" ? true : false;
var betaServer = process.env.BETA_MODE == "1" ? true : false;
var mode = debugMode ? "debug" : "production";

var requestStuff = {
  host: debugMode ? 'localhost:3000' : betaServer ? 'beta.habitrpg.com' : 'habitrpg.com'
};

if (process.env.FORCE === undefined) {
  prompt.start();

  var properties = [
    {
      name: 'okToContinue',
      type: 'string'
    }
  ];

  console.log("You are about to synchronize tasks between HabitRPG and Remember the Milk.\n\nMode: " + mode + "\nServer: " + requestStuff.host + "\n\nIf this is OK with you, type the word yes in full");
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

  if (fs.existsSync(hrpgConfigPath)) {
    ////// START HABIT //////
    parser.load(hrpgConfigPath);

    var hrpgAuth = {
      user_id: parser.param('auth.user_id'),
      api_token: parser.param('auth.api_token')
    };

    var options = {
      hostname: requestStuff.host,
      port: 443,
      path: '/api/v1/user/tasks?type=todo',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'x-api-user': hrpgAuth.user_id,
        'x-api-key': hrpgAuth.api_token
      }
    };

    console.log(JSON.stringify(options));

    // TODO: Use request() instead
    https.get(options, function(res) {
      var gunzip = gunzipJSON(res);

      console.log("Got response: " + res.statusCode);

      gunzip.on("data", function(chunk) {
        console.log("BODY: " + JSON.stringify(JSON.parse(chunk), null, 2));
      });

      gunzip.on('end', function() {
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
              rtmContinue(rtmapi, tempRtmCreds.authToken);
            }
            else {
              console.log("ACTION NEEDED: Looks like our authorization has expired. This happens sometimes; no big deal. I'm going to take you through the authentication process again now.");
              authorizeRtm(rtmapi);
            }
          });

          // Get tasks and stuff
        }
        else {
          authorizeRtm(rtmapi);
        }
        ///// END RTM //////
      });
    }).on('error', function(e) {
      console.log("Got error: " + e.message);
    });
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

function authorizeRtm(rtmapi) {
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
        onReturnFromRtmSite(rtmapi, theFrob);
      });
    });
  }
  else {
    console.log("WARNING: Skipping site authentication due to frob being provided on command line. This might send you into a callback loop. Press Ctrl+C if that happens.");
    onReturnFromRtmSite(rtmapi, existingFrob);
  }
}

function onReturnFromRtmSite(rtmapi, theFrob) {
  rtmapi.getToken(theFrob, function(authToken) {
    if (!authToken) {
      console.log("ERROR: Looks like authentication didn't work out. No big deal. Let's try again.");
      // TODO: If they do this a lot, will the stack get too big? Unlikely to happen though, so I'm not going to think too hard about it...
      authorizeRtm(rtmapi);
      return;
    }

    // Save the auth token, yeah?
    console.log("Saving your auth token so you won't have to do this again for a while...");
    fs.writeFileSync(path.join(process.env.HOME, '.htsrtmtoken.json'), authToken);
    rtmContinue(rtmapi, authToken);
  });
}

function rtmContinue(rtmapi) {
  console.log("Alright, we're all good on the authentication front. Let's continue grabbing those tasks.");
}

function gunzipJSON(response){
  var gunzip = zlib.createGunzip();
  var json = "";

  response.pipe(gunzip);

  return gunzip;
}

function onErr(err) {
  console.log(err);
  return 1;
}

#!/usr/bin/env node

var iniReader = require('inireader');

var parser = new iniReader.IniReader(),
  fs = require('fs'),
  path = require('path'),
  http = require('http'),
  https = require('https'),
  zlib = require('zlib'),
  rtmnode = require('rtmnode'),
  prompt = require('prompt'),
  request = require('superagent'),
  _ = require('underscore');

var hrpgConfigPath = path.resolve(path.join(process.env.HOME, '.habitrpgrc'));

var debugMode = process.env.DEBUG_MODE == "1" ? true : false;
var betaServer = process.env.BETA_MODE == "1" ? true : false;
var mode = debugMode ? "debug" : "production";

var requestStuff = {
  host: debugMode ? 'localhost:3000' : betaServer ? 'beta.habitrpg.com' : 'habitrpg.com'
};

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
    execute();
  }

  function onErr(err) {
    console.log(err);
    return 1;
  }
});

function execute() {
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
        console.log('Sync complete.');
      });
    }).on('error', function(e) {
      console.log("Got error: " + e.message);
    });
    ////// END HABIT //////

    ///// START RTM //////

    // TODO: Generate auth URL. Get user to go there and then come back and respond to some prompt when they have if we don't already have a valid auth token for them, then store the auth token in a file somewhere (probably the home directory).
    // If we have the token, then first just grab all the tasks in their Inbox.
    // Delay all API calls by 1 second.

    ///// END RM //////
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

function gunzipJSON(response){
  var gunzip = zlib.createGunzip();
  var json = "";

  response.pipe(gunzip);

  return gunzip;
}


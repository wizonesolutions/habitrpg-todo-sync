#!/usr/bin/env node

var TODO_SOURCE_RTM = "rtm"; // I hate long variable names, but one must do what one must do.
var HRPG_INCOMPLETE = false;
var HRPG_COMPLETE = true;

var iniReader = require('inireader');

var parser = new iniReader.IniReader(),
  fs = require('fs'),
  path = require('path'),
  http = require('http'),
  https = require('https'),
  RtmNode = require('./lib/rtmnode'),
  prompt = require('prompt'),
  request = require('superagent'),
  url = require('url'),
  util = require('util'),
  moment = require('moment'),
  HabitRpg = require('./lib/node-habit'),
  _ = require('underscore'),
  // TODO: Implement .usage() and whatnot
  argv = require('optimist')
    .alias('f', 'force')
    // TODO: Support repeating --debug for regular-verbose (essential API requests/responses) and super-verbose (all kinds of stuff, kinda like now) output.
    // Optimist can' do bo
    .alias('debug', 'verbose') // Implies NOT quiet
    .alias('debug', 'v')
    .alias('a', 'full-sync')
    .alias('u', 'user-id')
    .alias('p', 'api-key')
    .alias('n', 'dry-run')
    .alias('dev', 'D')
    .alias('beta', 'B')
    .alias('q', 'silence') // Implies force
    .alias('q', 'SILENCE')
    .alias('q', 'quiet')
    .argv;

var htsConfig = require('nconf'); // TODO: Get config from environment, then command line, then file. See also https://github.com/arscan/habitrpg-txt/blob/master/index.js#L6

if (argv.debug) {
  argv.q = false;
}

if (argv.q) {
  // Quiet means force.
  argv.f = true;
}

var hrpgConfigPath = path.resolve(path.join(process.env.HOME, '.habitrpgrc'));

var debugMode = argv.debug ? true : false;
var verboser = debugMode && argv.debug == "debug" || argv.debug == "2" ? true : false;
var devServer = argv.dev ? true : false;
var betaServer = argv.beta ? true : false;
var mode = debugMode ? "on" : "off";

var requestStuff = {
  host: devServer ? 'localhost' : betaServer ? 'beta.habitrpg.com' : 'habitrpg.com',
  port: devServer ? 3000 : 443,
  protocol: devServer ? 'http' : 'https',
  path: "/api/v1/user/tasks"
};

var habitResponse;

var startTime = moment();

if (!argv.f) {
  prompt.start();

  var properties = [
    {
      name: 'okToContinue',
      type: 'string'
    }
  ];

  console.log("You are about to synchronize tasks between HabitRPG and Remember the Milk.\n\n" +

    (argv.a ? "*** YOU HAVE REQUESTED A FULL SYNC OF ALL TASKS. ***\n\n" : "") +

    "Debugging output: " + mode + "\n" +
    "Server: " + requestStuff.host + "\n" +
    "Port: " + requestStuff.port + "\n\n" +

    (argv.n ? "*** This is a dry run. No data will be saved to HabitRPG or Remember the Milk. ***\n\n" : "") +

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
  if (!argv.q) {
    console.log('Now syncing with ' + requestStuff.host + '...');
  }

  var hrpgAuth = {};
  if (fs.existsSync(hrpgConfigPath)) {
    if (argv.u && argv.p) {
      if (!argv.q) {
        console.log("Using HabitRPG credentials from the environment instead of reading ~/.habitrpgrc.");
      }
      hrpgAuth = {
        user_id: argv.u,
        api_token: argv.p
      };
    } else {
      ////// START HABIT //////
      parser.load(hrpgConfigPath);

      var userIdParam = "auth.user_id";
      var apiTokenParam = "auth.api_token";

      // Which keys should we read?
      if (devServer) {
        if (!argv.q) {
          console.log('Using [auth-dev] settings from ' + hrpgConfigPath);
        }
        userIdParam = "auth-dev.user_id";
        apiTokenParam = "auth-dev.api_token";
      }

      // Fall back gracefully-ish on the live settings even in DEBUG_MODE
      hrpgAuth = {
        user_id: parser.param(userIdParam) || parser.param('auth.user_id'),
        api_token: parser.param(apiTokenParam) || parser.param('auth.api_token')
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

          habitResponse = moo(res.text); // I don't think Habit does this, but just in case. Also, I like calling moo().

          if (!argv.q) {
            console.log('Finished getting HabitRPG tasks.');
          }

          if (debugMode && verboser) {
            console.log("Massaged response from HabitRPG: " + util.inspect(habitResponse));
          }

          if (!argv.q) {
            console.log("We're ready to sync with Remember the Milk. First, we have to make sure we're still authenticated...");
          }
          ///// START RTM //////

          // If we have the token, then first just grab all the tasks in their Inbox.
          // Delay all API calls by 1 second.

          // OK, let's see what RTM says I have to do...OK, first I need a signing function. I sign my requests with this.
          var tempRtmCreds = {
            apiKey: "1cca74e8b073112b8e5975ec3d797e1a",
            sharedSecret: "a253e6102be98e1d"
          };

          // Will trigger event. No need to store it to a variable.
          var initialRtmApi = new RtmNode(tempRtmCreds.apiKey, tempRtmCreds.sharedSecret);

          tempRtmCreds.authToken = "";
          // TODO: Check for a stored auth token. Do the following if we don't have it.
          if (fs.existsSync(path.join(process.env.HOME, '.htsrtmtoken.json'))) {
            pathToToken = path.join(process.env.HOME, '.htsrtmtoken.json');
            tempRtmCreds.authToken = fs.readFileSync(pathToToken).toString();
          }

          if (tempRtmCreds.authToken) {
            // Do a check to make sure it works also. Because it might have expired.
            initialRtmApi.checkToken(tempRtmCreds.authToken, function(result) {
              if (result) {
                rtmContinue(habitapi, initialRtmApi, tempRtmCreds.authToken);
              } else {
                if (!argv.f) {
                  console.log("ACTION NEEDED: Looks like our authorization has expired. This happens sometimes; no big deal. I'm going to take you through the authentication process again now.");
                }
                else {
                  console.log("HabitRPG Todo Synchronization exited because you weren't authenticated with Remember the Milk. Please run it manually and get set up.");
                  return;
                }
                authorizeRtm(habitapi, initialRtmApi);
              }
            });

            // Get tasks and stuff
          } else {
            authorizeRtm(habitapi, initialRtmApi);
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

function authorizeRtm(habitapi, initialRtmApi) {
  // OK, wait, before the signing function, let's actually make something to sign.
  // Looks like the first thing I need is a frob. Uhh...oh wait, I need a way to call methods! I'll just do it straight up in the class to start and refactor later, maybe.
  existingFrob = undefined;
  skipSiteAuth = false;
  if (argv.frob !== undefined) {
    existingFrob = argv.frob;
    skipSiteAuth = true;
  }

  if (!skipSiteAuth) {
    if (argv.debug) {
      console.log('Existing frob: ' + existingFrob);
    }
    // TODO: Don't need existingFrob anymore. It was to avoid branching here.
    // Now I have, so kill it some itme.
    initialRtmApi.getFrob(existingFrob, function(theFrob) {
      // We have frob. Umm, so now what? Oh, OK. We have to build an
      // authentication URL. This is pretty easy.
      var authUrl = initialRtmApi.getAuthUrl(theFrob);
      console.log("\n" +
                  'Go here and authorize this app: ' + "\n\n" +

                  authUrl + "\n\n" +

                  "I'll wait. Just press enter when you're done or if you've already authorized and provided the frob as an environment variable (looking at you @wizonesolutions).");
      prompt.start();
      prompt.get("dummyEnter", function(err, result) {
        if (err) { return onErr(err); }
        onReturnFromRtmSite(habitapi, initialRtmApi, theFrob);
      });
    });
  } else {
    if (!argv.q) {
      console.log("WARNING: Skipping site authentication due to frob being provided on command line. This might send you into a callback loop. Press Ctrl+C if that happens.");
    }
    onReturnFromRtmSite(habitapi, initialRtmApi, existingFrob);
  }
}

function onReturnFromRtmSite(habitapi, initialRtmApi, theFrob) {
  initialRtmApi.getToken(theFrob, function(authToken) {
    if (!authToken) {
      console.log("ERROR: Looks like authentication didn't work out. No big deal. Let's try again.");
      // TODO: If they do this a lot, will the stack get too big? Unlikely to happen though, so I'm not going to think too hard about it...
      authorizeRtm(habitapi, initialRtmApi);
      return;
    }

    // Save the auth token, yeah?
    if (!argv.q) {
      console.log("Saving your auth token so you won't have to do this again for a while...");
    }
    fs.writeFileSync(path.join(process.env.HOME, '.htsrtmtoken.json'), authToken);
    rtmContinue(habitapi, initialRtmApi, authToken);
  });
}

function rtmContinue(habitapi, initialRtmApi, authToken) {
  initialRtmApi.setAuthToken(authToken);
  initialRtmApi.initializeTimeline();
  initialRtmApi.on('RtmNodeReady', function(rtmapi) {
    if (!argv.q) {
      console.log("Alright, we're all good on the authentication front. Let's continue grabbing those tasks.");
    }

    var firstSyncFilter = 'status:incomplete AND addedWithin:"1 week of today"';
    var prodPath = path.join(process.env.HOME, '.htsrtmlastsync');
    var devPath = path.join(process.env.HOME, '.htsrtmlastsync-dev');
    var rightPath = argv.dev ? devPath : prodPath;

    // TODO: Test that lastSync works when there is no file
    lastSync = undefined;
    filter = firstSyncFilter;

    // Something passed on the command line?
    if (argv.filter) {
      // OK, so in this case we AND their filter with status:incomplete. That's hardcoded until someone wants to override it.
      filter = 'status:incomplete AND ' + argv.filter;
    }

    // For the brave
    if (argv.a) {
      filter = 'status:incomplete';
      if (argv.filter) {
        // OK, so in this case we AND their filter with status:incomplete. That's hardcoded until someone wants to override it.
        filter = 'status:incomplete AND ' + argv.filter;
      }
      lastSync = undefined;
    } else {
      // Figure out when we last synced.
      // TODO: Try combining this stuff floating around into one file. Either .habitrpgrc or my own.
      if ((!argv.dev && fs.existsSync(prodPath)) || (argv.dev && fs.existsSync(devPath))) {
        lastSync = fs.readFileSync(rightPath).toString();
        if (filter == firstSyncFilter) {
          filter = undefined; // filter messes us up if we actually have a last_sync.
        }
        if (argv.filter) {
          filter = argv.filter; // We don't need status:incomplete here. You could almost say that we don't want it.
        }
      }
    }

    if (lastSync === undefined && !argv.a) {
      if (!argv.q) {
        console.log("This is the first run. A full sync was not requested, so we are getting tasks added within the last week.");
      }
    } else if (lastSync === undefined && argv.a) {
      if (!argv.q) {
        console.log("Doing a full sync!");
      }
    } else {
      if (!argv.q) {
        console.log('We last synchronized on ' + lastSync);
      }
    }

    if (filter) {
      if (!argv.q) {
        console.log("We are filtering tasks with the following search criteria: " + filter);
      }
    }
    else {
      if (!argv.q) {
        console.log("We are not filtering tasks.");
      }
    }
    // For additional fun and profit (JUST KIDDING REMEMBER THE MILK; IT'S
    // STRICTLY ONLY FOR FUN), let's massage the Habit task data a little bit.
    var habitTaskMap = massageHabitTodos(habitResponse);

    if (!argv.n) {
      // TODO: Abstract path to this file. Quit duplicating code.
      // TODO: Roll back to the file's original time if something goes wrong.
      // OR: Emit an event when all the adding and deleting has finished, and only write the file then.
      fs.writeFileSync(rightPath, startTime.format());
    } else {
      if (!argv.q) {
        console.log("DRY RUN: Not writing lastSync time to file.");
      }
    }

    rtmapi.getTasks(undefined, filter, lastSync, function(response) {
      // TODO: I would update the lastSync here

      // console.log(util.inspect(response.tasks));
      response.tasks = moo(response.tasks);
      var tasksAdded = 0;
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
            if (debugMode && verboser) {
              console.log('Debug output for this taskseries: ' + util.inspect(taskseries));
            }
            // Don't add completed tasks.
            if (taskseries === undefined || (taskseries && taskseries.task && taskseries.task.completed)) { return true; }
            // Add it.
            if (habitTaskMap && habitTaskMap[TODO_SOURCE_RTM] && habitTaskMap[TODO_SOURCE_RTM][taskseries.id]) {
              skipTask = true;
              putTask = false;

              thisTask = habitTaskMap[TODO_SOURCE_RTM][taskseries.id];

              // So, has anything changed from what we have?
              taskSeriesDate = taskseries.task.due;
              thisTaskDate = thisTask.date;

              var dateTheSame = true;

              if (taskSeriesDate && thisTaskDate) {
                if (argv.debug) {
                  console.log(taskseries.name + ": RTM's date is " + taskSeriesDate + " and ours is " + thisTaskDate);
                }
                dateTheSame = (moment(thisTask.date).format() == moment(taskseries.task.due).format());
              }
              else {
                dateTheSame = false;
                if (!taskSeriesDate && !thisTaskDate) {
                  if (argv.debug) {
                    console.log(taskseries.name + ": Neither date is set.");
                  }
                  dateTheSame = true;
                }
              }

              // The date? Unset or changed?
              if (!dateTheSame || argv.refresh) {
                putTask = true;
                if (taskseries.task.due) {
                  thisTask.date = moment(taskseries.task.due).format();
                }
                else {
                  thisTask.date = '';
                }
              }

              // The name?
              if ((thisTask.text != taskseries.name) || argv.refresh) {
                putTask = true;
                thisTask.text = taskseries.name;
              }

              // TODO: Was it completed?

              if (skipTask) {
                if (argv.debug) {
                  console.log('Skipping existing task: ' + taskseries.name);
                }
              }

              if (putTask) {
                if (!argv.q) {
                  console.log('We know about "' + thisTask.text + '", but it was updated in Remember the Milk. Syncing changes.');
                }
                habitapi.putTask(thisTask, function(err) {
                  if (err) {
                    console.log("ERROR: Saving task to Habit didn't work. We'll try again next time.");
                    fs.writeFileSync(rightPath, lastSync);
                  }
                });
              }
            } else {
              if (!argv.n) {
                habitapi.addTask('todo', taskseries.name, {
                  hts_external_id: taskseries.id,
                  hts_external_source: TODO_SOURCE_RTM,
                  hts_external_rtm_list_id: list.id,
                  hts_external_rtm_task_id: taskseries.task.id,
                  hts_last_known_state: HRPG_INCOMPLETE,
                  api_source: TODO_SOURCE_RTM,
                  up: true,
                  down: false,
                  value: 0,
                  date: (moment(taskseries.task.due) ? moment(taskseries.task.due).format() : undefined)
                }, function(err, newTask) {
                  if (!err) {
                    habitTaskMap[TODO_SOURCE_RTM] = habitTaskMap[TODO_SOURCE_RTM] || {};
                    habitTaskMap[TODO_SOURCE_RTM][taskseries.id] = habitTaskMap[TODO_SOURCE_RTM][taskseries.id] || newTask;
                    if (!argv.q) {
                      console.log("Added: " + newTask.text);
                    }
                  }
                  else {
                    console.log("ERROR: We tried to add " + taskseries.name + ", but we had a problem. We'll try again next time.");
                    fs.writeFileSync(rightPath, lastSync);
                  }
                });
              } else {
                if (!argv.q) {
                  console.log('Dry run summary: Would add "' + taskseries.name + '". The API would tell us something like:' + "\n\n" +
                    util.inspect({
                      type: "todo",
                      text: taskseries.name,
                      hts_external_id: taskseries.id,
                      hts_external_source: TODO_SOURCE_RTM,
                      hts_external_rtm_list_id: list.id,
                      hts_external_rtm_task_id: taskseries.task.id,
                      hts_last_known_state: HRPG_INCOMPLETE,
                      api_source: TODO_SOURCE_RTM,
                      completed: false,
                      id: "not available in dry run mode",
                      value: 0,
                      date: (moment(taskseries.task.due) ? moment(taskseries.task.due).format() : undefined)
                    }));
                }
              }
              tasksAdded++;
              if (argv.debug) {
                console.log('Total tasks found so far: ' + tasksAdded);
              }
            }
            return true;
          });
          return true;
        });
        return true;
      });
    });

    // In this one, we explicitly send a filter of undefined so we can check for deleted tasks
    rtmapi.getTasks(undefined, undefined, lastSync, function(response) {
      // TODO: I would update the lastSync here

      // console.log(util.inspect(response.tasks));
      response.tasks = moo(response.tasks);
      var tasksAdded = 0;
      response.tasks.every(function(item) {
        if (item === undefined) { return true; }

        item.list = moo(item.list);

        item.list.every(function(list) {
          if (list === undefined) { return true; }
          // console.log('taskseries for ' + item.id + ': ' + util.inspect(item.taskseries));

          // We're pretty much done here, so it's fine for this to be async. I
          // think. It's probably going to say it's done too soon, but whatevs.

          if (list.deleted) {
            list.deleted = moo(list.deleted);

            list.deleted.every(function(deleted) {
              if (deleted === undefined) { return false; }
              deleted.taskseries = moo(deleted.taskseries);
              deleted.taskseries.every(function(taskseries) {
                // TODO: OMG PUT THIS IN A VARIABLE STOP DUPING A TWO-LEVEL DEEP OBJECT
                // This comment left way too late at night
                if (habitTaskMap && habitTaskMap[TODO_SOURCE_RTM] && habitTaskMap[TODO_SOURCE_RTM][taskseries.id]) {
                  if (!argv.q) {
                    console.log('Deleting task: ' + habitTaskMap[TODO_SOURCE_RTM][taskseries.id].text);
                  }
                  if (!argv.n) {
                    habitapi.deleteTask(habitTaskMap[TODO_SOURCE_RTM][taskseries.id].id, function(err, response) {
                      if (!err) {
                        if (!argv.q) {
                          console.log("Deleted " + habitTaskMap[TODO_SOURCE_RTM][taskseries.id].text)
                        }
                        habitTaskMap[TODO_SOURCE_RTM][taskseries.id] = undefined;
                      }
                      else {
                        console.log("Had a problem deleting " + habitTaskMap[TODO_SOURCE_RTM][taskseries.id].text + ". Will try again next time. If the problem persists, file a bug report at https://github.com/wizonesolutions/habitrpg-todo-sync/issues. It might be temporary though.");
                        // Reset the lastSync time so it will try the delete again next time
                        fs.writeFileSync(rightPath, lastSync);
                      }
                    });
                  } else {
                    if (!argv.q) {
                      console.log('Dry run, so not really deleting. Would delete Habit task ' + habitTaskMap[TODO_SOURCE_RTM][taskseries.id].id + ', called ' + habitTaskMap[TODO_SOURCE_RTM][taskseries.id].text);
                    }
                  }
                } else {
                  if (argv.debug) {
                    console.log("We have no record of task " + taskseries.id + ', so doing nothing.');
                  }
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

    processHabitTodos(habitTaskMap, habitapi, rtmapi);
  });
}

function processHabitTodos(habitTaskMap, habitapi, rtmapi) {
  if (habitTaskMap && habitTaskMap[TODO_SOURCE_RTM]) {
    // This is pretty simple. Go through each Habit todo. Is it completed? Was it not completed last time? OK. Tell RTM that.
    var taskKeys = Object.keys(habitTaskMap[TODO_SOURCE_RTM]);
    taskKeys.forEach(function(taskKey) {
      var task = habitTaskMap[TODO_SOURCE_RTM][taskKey];

      // Any falsy value is OK, hence no ===
      if (task.hts_last_known_state == HRPG_INCOMPLETE && task.completed) {
        // Complete on RTM side. We do this blindly. It's OK.
        if (!argv.n) {
          rtmapi.completeTask(task.hts_external_rtm_list_id, task.hts_external_id, task.hts_external_rtm_task_id, undefined, function(err, rtmTask) {
            var harmlessError = false;
            if (err) {
              if (argv.debug) {
                console.log("err looks like: " + util.inspect(err));
              }
              if (err.rsp.err.code == "340") {
                harmlessError = true;
                console.log("Remember the Milk said it doesn't know about " + task.hts_external_rtm_list_id + "."  + task.hts_external_id + "." + task.hts_external_rtm_task_id + ". That's fine. We'll just update this task on our side so this doesn't happen again.");
              }
            }
            if (!err || harmlessError) {
              task.hts_last_known_state = HRPG_COMPLETE;
              habitapi.putTask(task);
              if (!argv.q) {
                console.log("Completed \"" + task.text + "\" in Remember the Milk. Good job!");
              }
            }
            else {
              // Do nothing
            }
          });
        }
        else {
          if (argv.debug) {
            console.log("Would complete list " + task.hts_external_rtm_list_id + ', taskseries ' + task.hts_external_id + ', ' + task.hts_external_rtm_task_id);
            console.log("In HabitRPG, this task is called: " + task.text);
          }
        }
      }
      else {
        if (debugMode) {
          if (verboser) {
            console.log('[HabitRPG] ' + task.text + ' still has the same status (' + (task.hts_last_known_state == HRPG_INCOMPLETE ? 'incomplete' : 'complete') + '), so doing nothing.');
          }
        }
      }
    });
  }
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
    if (item && item.hts_external_source) {
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

var request = require('superagent'),
  util = require('util'),
  _ = require('underscore');

function HabitRpg(userId, apiKey, apiUrl) {
  this.userId = userId;
  this.apiKey = apiKey;

  this.apiUrl = apiUrl || 'https://habitrpg.com';

  this.addTask = function(type, text, optional, callback) {
    var theRequest = request.post(this.apiUrl + '/api/v1/user/task')
      .type('application/json')
      .set('Accept: gzip, deflate')
      .set('x-api-user', this.userId)
      .set('x-api-key', this.apiKey)
      .send({
        type: type,
        text: text
      });

    if (optional) {
      theRequest.send(optional);
    }
    theRequest.end(function(res) {
      if (res.ok) {
        console.log('Added: ' + text);
        console.log('Status code: ' + res.status);
        console.log('Technical details: ' + util.inspect(res.body));
        if (callback) {
          callback(res.body);
        }
      } else {
        console.log('Error in addTask: ' + util.inspect(res.text));
        console.log('Error information: ' + util.inspect(res.error));
      }
    });
  };

  // Copied from addTask
  this.putTask = function(wholeTask, callback) {
    if (wholeTask) {
      // We don't want to update the id
      var originalTask = _.clone(wholeTask);
      wholeTask.id = undefined;
      var theRequest = request.put(this.apiUrl + '/api/v1/user/task/' + originalTask.id)
        .type('application/json')
        .set('Accept: gzip, deflate')
        .set('x-api-user', this.userId)
        .set('x-api-key', this.apiKey)
        .send(wholeTask)
        .end(function(res) {
          if (res.ok) {
            console.log('Updated: ' + wholeTask.text);
            console.log('Status code: ' + res.status);
            console.log('Technical details: ' + util.inspect(res.body));
            if (callback) {
              callback(res.body);
            }
          } else {
            console.log('Error in putTask: ' + util.inspect(res.text));
            console.log('Error information: ' + util.inspect(res.error));
          }
        });
    }
  };

  // TODO: Copied from addTask. Refactor.
  // TODO: Support error callbacks throughout the module.
  this.deleteTask = function(id, callback) {
    var theRequest = request.del(this.apiUrl + '/api/v1/user/task/' + id)
        .set('Content-Length', '0')
        .set('Accept', 'application/json')
        .set('x-api-user', this.userId)
        .set('x-api-key', this.apiKey)
        .end(function(res) {
          if (res.ok && res.status == 204) {
            console.log('Deleted: ' + id);
            console.log('Status code: ' + res.status);
            console.log('Technical details: ' + util.inspect(res.text));
            if (callback) {
              callback(undefined, res.text);
            }
          } else {
            console.log('Error in deleteTask: ' + util.inspect(res.text));
            console.log('Error information: ' + util.inspect(res.error));
            callback(true, res.text);
          }
        });
  };
}

module.exports = HabitRpg;

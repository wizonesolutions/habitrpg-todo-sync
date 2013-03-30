There weren't any node.js HabitRPG API wrappers yet. I got tired of passing stuff around and made this.

It's not that there weren't any good ones (this one isn't very good), just that there were *none* of which I was aware.

Uhh, usage. It's probably something like

````javascript
var HabitRpg = require('node-habit');

var habitApi = new HabitRpg('YOUR_USER_ID_EXCEPT_REALLY_NOT_THIS_STRING', 'YOUR_API_TOKEN', 'API_URL'); // You don't really need to set API_URL unless you are testing locally, for example.

// Add a new task (I was generous on this one).
habitApi.addTask('todo', 'Text for the task', { note: 'Optional parameter object' }, function() {
  // I'm not really sure what you would do here other than perpetuate the callback pyramid.
});
````

* Unless I forget to update the docs.

Pull requests and complete rewrites accepted warmly.

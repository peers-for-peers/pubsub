window.localStorage.debug = 'pubsub'

var PubSub = require('.')
var test = require('tape')

// For using a fake signalling server that runs in the browser
// var opts = {Connector: PubSub.LocalConnector}

// For connecting to the socketio signalling server
var opts = {socketioUrl: '//:3000'}

test('sanity', function (t) {
  t.timeoutAfter(3000)
  t.plan(2)

  var topic = 'cats'
  var ps1 = new PubSub(topic, opts)
  var ps2 = new PubSub(topic, opts)

  ps1.on('message', function (message) {
    t.equal(message, 'foo')
    ps1.publish('bar')
  })

  ps2.on('message', function (message) {
    t.equal(message, 'bar')
    t.end()
  })

  ps2.publish('foo')
})

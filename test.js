window.localStorage.debug = 'pubsub'

var PubSub = require('.')
var test = require('tape')

var opts = {Connector: PubSub.LocalConnector}

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

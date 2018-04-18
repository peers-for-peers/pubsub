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

  var topic = Math.random().toString(16).substr(2)
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

test('id.distance', function (t) {
  t.timeoutAfter(3000)

  var max = PubSub.id.ID_MAX.toString(PubSub.id.ID_BASE)
  var maxMinusOne = PubSub.id.ID_MAX.minus(1).toString(PubSub.id.ID_BASE)
  var maxHalf = PubSub.id.ID_MAX.divide(2).toString(PubSub.id.ID_BASE)

  t.equal(PubSub.id.distance('0', '0').valueOf(), 0)
  t.equal(PubSub.id.distance('0', '1').valueOf(), 1)
  t.equal(PubSub.id.distance('1', '0').valueOf(), -1)
  t.equal(PubSub.id.distance(max, '0').valueOf(), 1)
  t.equal(PubSub.id.distance('0', max).valueOf(), -1)
  t.equal(PubSub.id.distance(maxMinusOne, max).valueOf(), 1)
  t.equal(PubSub.id.distance(max, maxMinusOne).valueOf(), -1)
  t.equal(PubSub.id.distance(0, maxHalf).toString(16), maxHalf)

  t.end()
})

test('id.distanceComparator', function (t) {
  var max = PubSub.id.ID_MAX.toString(PubSub.id.ID_BASE)
  var maxMinusOne = PubSub.id.ID_MAX.minus(1).toString(PubSub.id.ID_BASE)
  var idList = ['0', '2', max]

  idList.sort(PubSub.id.distanceComparator.bind(null, '3'))
  t.deepEqual(idList, ['2', '0', max])

  idList.sort(PubSub.id.distanceComparator.bind(null, max))
  t.deepEqual(idList, [max, '0', '2'])

  idList.sort(PubSub.id.distanceComparator.bind(null, maxMinusOne))
  t.deepEqual(idList, [max, '0', '2'])

  idList.sort(PubSub.id.distanceComparator.bind(null, '0'))
  t.deepEqual(idList, ['0', max, '2'])

  t.end()
})

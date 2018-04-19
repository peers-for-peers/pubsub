/* eslint-env mocha, browser */

// Enable debug logging for pubsub with color logging disabled
window.localStorage.debug = 'pubsub'
require('debug').useColors = function () { return false }

var assert = require('assert')
var PubSub = require('.')

var opts = {socketioUrl: '//:3000'}

describe('pubsub', function () {
  this.timeout(3000)

  it('sanity', function (done) {
    var topic = Math.random().toString(16).substr(2)
    var ps1 = new PubSub(topic, opts)
    var ps2 = new PubSub(topic, opts)

    ps1.on('message', function (message) {
      assert.equal(message, 'foo')
      ps1.publish('bar')
    })

    ps2.on('message', function (message) {
      assert.equal(message, 'bar')
      ps1.destroy()
      ps2.destroy()
      done()
    })

    ps2.publish('foo')
  })

  it('3rd peer joins late', function (done) {
    var topic = Math.random().toString(16).substr(2)
    var ps1 = new PubSub(topic, opts)
    var ps2 = new PubSub(topic, opts)
    var ps3

    var messageCount = 0

    ps1.on('message', function (message) {
      assert.equal(message, 'foo')
      messageCount++
      ps3 = new PubSub(topic, opts)

      ps3.on('message', function (message) {
        assert(message === 'bar' || message === 'foo')
        messageCount++
        if (messageCount === 4) finish()
      })

      ps3.once('peer-connect', function (peerID) {
        assert(peerID === ps1.peerID || peerID === ps2.peerID)
        ps1.publish('bar')
      })
    })

    ps2.on('message', function (message) {
      assert.equal(message, 'bar')
      messageCount++
      if (messageCount === 4) finish()
    })

    ps2.publish('foo')

    function finish () {
      ps1.destroy()
      ps2.destroy()
      ps3.destroy()
      done()
    }
  })

  it('id.distance', function () {
    var max = PubSub.id.ID_MAX.toString(PubSub.id.ID_BASE)
    var maxMinusOne = PubSub.id.ID_MAX.minus(1).toString(PubSub.id.ID_BASE)
    var maxHalf = PubSub.id.ID_MAX.divide(2).toString(PubSub.id.ID_BASE)

    assert.equal(PubSub.id.distance('0', '0').valueOf(), 0)
    assert.equal(PubSub.id.distance('0', '1').valueOf(), 1)
    assert.equal(PubSub.id.distance('1', '0').valueOf(), -1)
    assert.equal(PubSub.id.distance(max, '0').valueOf(), 1)
    assert.equal(PubSub.id.distance('0', max).valueOf(), -1)
    assert.equal(PubSub.id.distance(maxMinusOne, max).valueOf(), 1)
    assert.equal(PubSub.id.distance(max, maxMinusOne).valueOf(), -1)
    assert.equal(PubSub.id.distance(0, maxHalf).toString(16), maxHalf)
  })

  it('id.distanceComparator', function () {
    var max = PubSub.id.ID_MAX.toString(PubSub.id.ID_BASE)
    var maxMinusOne = PubSub.id.ID_MAX.minus(1).toString(PubSub.id.ID_BASE)
    var idList = ['0', '2', max]

    idList.sort(PubSub.id.distanceComparator.bind(null, '3'))
    assert.deepEqual(idList, ['2', '0', max])

    idList.sort(PubSub.id.distanceComparator.bind(null, max))
    assert.deepEqual(idList, [max, '0', '2'])

    idList.sort(PubSub.id.distanceComparator.bind(null, maxMinusOne))
    assert.deepEqual(idList, [max, '0', '2'])

    idList.sort(PubSub.id.distanceComparator.bind(null, '0'))
    assert.deepEqual(idList, ['0', max, '2'])
  })
})

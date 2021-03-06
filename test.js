/* eslint-env mocha, browser */

// Enable debug logging for pubsub with color logging disabled
window.localStorage.debug = 'pubsub'
require('debug').useColors = () => false

const assert = require('assert')
const PubSub = require('.')

const opts = { socketioUrl: '//:3000' }

describe('pubsub', function () {
  this.timeout(3000)

  // ps2 -(foo)-> ps1
  // ps1 -(bar)-> ps2
  it('sanity', function (done) {
    const topic = Math.random().toString(16).substr(2)
    let ps1 = new PubSub(topic, opts)
    let ps2 = new PubSub(topic, opts)

    const finish = () => {
      ps1.destroy()
      ps2.destroy()
      done()
    }

    ps1.on('message', (message) => {
      assert.equal(message, 'foo')
      ps1.publish('bar')
    })

    ps2.on('message', (message) => {
      assert.equal(message, 'bar')
      finish()
    })

    ps2.publish('foo')
  })

  it('peer joins late', function (done) {
    const topic = Math.random().toString(16).substr(2)
    let ps1 = new PubSub(topic, opts)
    let ps2 = null

    const finish = () => {
      ps1.destroy()
      ps2.destroy()
      done()
    }

    ps1.publish('bar')

    ps2 = new PubSub(topic, opts)

    ps2.on('message', (message) => {
      assert(message === 'bar')
      finish()
    })
  })

  // ps2 -(foo)-> ps1
  // ps3 connects
  // ps1 -(bar)-> ps2, ps3 OR ps2->(foo)->ps3
  it('3rd peer joins late', function (done) {
    const topic = Math.random().toString(16).substr(2)
    let ps1 = new PubSub(topic, opts)
    let ps2 = new PubSub(topic, opts)
    let ps3 = null

    let messageCount = 0

    const finish = () => {
      ps1.destroy()
      ps2.destroy()
      ps3.destroy()
      done()
    }

    ps1.on('message', (message) => {
      assert.equal(message, 'foo')
      messageCount++

      ps3 = new PubSub(topic, opts)

      ps3.on('message', (message) => {
        assert(message === 'bar' || message === 'foo')
        messageCount++
        if (messageCount === 4) finish()
      })

      ps3.once('peer-connect', (peerID) => {
        assert(peerID === ps1.peerID || peerID === ps2.peerID)
        ps1.publish('bar')
      })
    })

    ps2.on('message', (message) => {
      assert.equal(message, 'bar')
      messageCount++
      if (messageCount === 4) finish()
    })

    ps2.publish('foo')
  })
})

describe('id', function () {
  this.timeout(100)

  it('id.distance', function () {
    const max = PubSub.id.ID_MAX.toString(PubSub.id.ID_BASE)
    const maxMinusOne = PubSub.id.ID_MAX.minus(1).toString(PubSub.id.ID_BASE)
    const maxHalf = PubSub.id.ID_MAX.divide(2).toString(PubSub.id.ID_BASE)

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
    const max = PubSub.id.ID_MAX.toString(PubSub.id.ID_BASE)
    const maxMinusOne = PubSub.id.ID_MAX.minus(1).toString(PubSub.id.ID_BASE)
    const idList = ['0', '2', max]

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

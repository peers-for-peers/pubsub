module.exports = ConnectionPool

var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')
var SocketIOClient = require('socket.io-client')
var SimplePeer = require('simple-peer')
var debug = require('debug')('pubsub:connectionpool')

inherits(ConnectionPool, EventEmitter)
function ConnectionPool (instanceId, opts) {
  EventEmitter.call(this)

  this.instanceId = instanceId

  this._socketio = SocketIOClient('//localhost:3000')
  this._connections = {} // { instanceId: SimplePeer instance }

  this._socketio.on('relay', this._onRelay.bind(this))

  debug('new ConnectionPool()', instanceId, opts)
}

ConnectionPool.prototype._onRelay = function (msg) {
  debug('ONRELAY', 'from=' + msg.from, 'to=' + msg.to, msg.signal)
  var conn = this._connections[msg.from]
  if (conn == null) {
    this._connect(msg.from, false, null)
    conn = this._connections[msg.from]
    this.emit('peer', conn)
  }

  conn.signal(msg.signal)
}

ConnectionPool.prototype.discover = function (topicId, cb) {
  var self = this

  self._socketio.on('join-rsp', onRsp)
  self._socketio.emit('join-req', { id: self.instanceId, topic: topicId })

  function onRsp (msg) {
    if (topicId in msg) {
      debug('DISCOVERED', 'topic=' + topicId, msg[topicId])
      self._socketio.removeListener('join-rsp', onRsp)
      cb(null, msg[topicId]) // return a list of online instance IDs
    }
  }
}

ConnectionPool.prototype.connect = function (instanceId, cb) {
  return this._connect(instanceId, true, cb)
}

ConnectionPool.prototype._connect = function (instanceId, initiator) {
  var self = this

  debug('CONNECTING', 'target=' + instanceId, 'initiator=' + initiator)

  var simplepeer = new SimplePeer({ initiator: initiator })

  // TODO is removing the listeners necessary?
  simplepeer.id = instanceId
  simplepeer.on('error', onError)
  simplepeer.on('signal', onSignal)
  simplepeer.on('connect', onConnect)
  simplepeer.on('close', onClose)

  self._connections[instanceId] = simplepeer
  return simplepeer

  function onConnect () {
    debug('CONNECTED', 'target=' + instanceId)
    self.emit('connect', simplepeer)
  }

  function onSignal (signal) {
    debug('SIGNALED', 'target=' + instanceId, signal)
    self._socketio.emit('relay', {
      to: instanceId,
      from: self.instanceId,
      signal: signal
    })
  }

  function onClose () {
    debug('CLOSED', 'target=' + instanceId)
    delete self._connections[instanceId]
  }

  function onError (err) {
    debug('ERRORED', 'target=' + instanceId, err)
  }
}

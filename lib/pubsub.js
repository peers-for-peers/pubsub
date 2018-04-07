module.exports = PubSub

var EventEmitter = require('events').EventEmitter
var SimplePeer = require('simple-peer')
var inherits = require('inherits')
var debug = require('debug')('pubsub')
var SocketIOConnector = require('./socketioconnector.js')

var LEFT_INDEX = 0
var RIGHT_INDEX = 1

// Emits 'message', 'warning'
inherits(PubSub, EventEmitter)
function PubSub (topicId, opts) {
  if (!(this instanceof PubSub)) return new PubSub(opts)
  if (!opts) opts = {}
  EventEmitter.call(this)

  this.instanceId = genID()
  this.topicId = topicId

  this._connections = [null, null] // Length two array with [left connection, right connection]
  this._pendingMessages = [{}, {}]
  this._connector = opts.connector || new SocketIOConnector(this.instanceId, opts)

  this._connector.on('relay', this._onRelay.bind(this))

  debug('new PubSub()', 'instanceId=' + this.instanceId, 'topicId=' + topicId, opts)

  this._connector.discover(topicId, this._onDiscover.bind(this))
}

PubSub.prototype._onDiscover = function (err, onlineIDs) {
  if (err) throw err // TODO handle more gracefully
  debug('DISCOVERED', onlineIDs)
  onlineIDs.sort(idCompare.bind(null, this.instanceId))
  for (var i in onlineIDs) {
    var onlineID = onlineIDs[i]
    if (onlineID === this.instanceId) continue

    var index = (onlineID < this.instanceId) ? LEFT_INDEX : RIGHT_INDEX
    if (this._connections[index] == null) {
      this._setupConnection(onlineID, true)
    }
  }
}

PubSub.prototype._onConnect = function (conn) {
  // Send all the outstanding messages that accumilated while the peer was not connected
  var self = this
  var index = self._connections.findIndex(function (c) { return c === conn })
  Object.keys(self._pendingMessages[index]).forEach(function (key) {
    conn.send(JSON.stringify(self._pendingMessages[index][key]))
  })
  self._pendingMessages[index] = {}
}

PubSub.prototype._onClose = function (conn) {
  debug('CLOSED', 'target=' + conn.id)
  var index = this._connections.findIndex(function (c) { return c === conn })
  if (index !== -1) {
    this._connections[index] = null
    this._connector.discover(this.topicId, this._onDiscover.bind(this))
  }
}

PubSub.prototype._onData = function (conn, stringMsg) {
  var msg = JSON.parse(stringMsg)

  debug('MESSAGE', msg)

  for (var i in this._connections) {
    var c = this._connections[i]
    if (c === conn) continue
    if (c && c.connected) c.send(stringMsg)
    else this._pendingMessages[i][msg.id] = msg
  }

  this.emit('message', msg.payload)
}

PubSub.prototype._onError = function (err) {
  this.emit('warning', err)
}

PubSub.prototype.publish = function (payload) {
  var msg = {
    id: genID(),
    payload: payload
  }

  debug('PUBLISH', msg)

  for (var i in this._connections) {
    var conn = this._connections[i]
    if (conn && conn.connected) conn.send(JSON.stringify(msg))
    else this._pendingMessages[i][msg.id] = msg
  }
}

PubSub.prototype._onRelay = function (msg) {
  debug('ONRELAY', 'from=' + msg.from, 'to=' + msg.to, msg.signal)
  var index = this._connections.findIndex(function (c) { return c && c.id === msg.from })
  var conn = this._connections[index]
  if (conn == null) {
    this._setupConnection(msg.from, false)
    index = this._connections.findIndex(function (c) { return c && c.id === msg.from })
    conn = this._connections[index]
    this.emit('peer', conn)
  }

  conn.signal(msg.signal)
}

PubSub.prototype._setupConnection = function (instanceId, initiator) {
  var self = this

  debug('CONNECTING', 'target=' + instanceId, 'initiator=' + initiator)

  var simplepeer = new SimplePeer({ initiator: initiator })

  simplepeer.id = instanceId

  // TODO is removing the listeners necessary?
  simplepeer.on('data', self._onData.bind(self, simplepeer))
  simplepeer.on('close', self._onClose.bind(self, simplepeer))
  simplepeer.on('error', self._onError.bind(self))
  simplepeer.on('connect', self._onConnect.bind(self, simplepeer))
  simplepeer.on('error', onError)
  simplepeer.on('signal', onSignal)

  // TODO what if the new simplepeer's id is further away than are existing simplepeer?
  var index = (instanceId < self.instanceId) ? LEFT_INDEX : RIGHT_INDEX
  var oldConn = self._connections[index]
  self._connections[index] = simplepeer
  if (oldConn) oldConn.destroy()

  function onSignal (signal) {
    debug('SIGNALED', 'target=' + instanceId, signal)
    self._connector.relay({
      to: instanceId,
      from: self.instanceId,
      signal: signal
    })
  }

  function onError (err) {
    debug('ERRORED', 'target=' + instanceId, err)
  }
}

function genID () {
  return Math.round(Math.random() * 9e16).toString()
}

function idCompare (targetID, idA, idB) {
  return Math.abs(targetID - idA) - Math.abs(targetID - idB)
}

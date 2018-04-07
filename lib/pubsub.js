module.exports = PubSub

var EventEmitter = require('events').EventEmitter
var ConnectionPool = require('./connectionpool')
var inherits = require('inherits')
var debug = require('debug')('pubsub')

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
  this._connectionPool = opts.ConnectionPool || new ConnectionPool(this.instanceId, opts)
  this._pendingMessages = [{}, {}]

  debug('new PubSub()', 'instanceId=' + this.instanceId, 'topicId=' + topicId, opts)

  this._connectionPool.on('peer', this._setupConnection.bind(this))

  this._connectionPool.discover(topicId, this._onDiscover.bind(this))
}

PubSub.prototype._onDiscover = function (err, onlineIDs) {
  if (err) throw err // TODO handle more gracefully
  onlineIDs.sort(idCompare.bind(null, this.instanceId))
  for (var i in onlineIDs) {
    var onlineID = onlineIDs[i]
    if (onlineID === this.instanceId) continue

    var index = (onlineID < this.instanceId) ? LEFT_INDEX : RIGHT_INDEX
    if (this._connections[index] == null) {
      this._setupConnection(this._connectionPool.connect(onlineID))
    }
  }
}

PubSub.prototype._setupConnection = function (conn) {
  // TODO what if the new conn's id is further away than are existing conn?
  var index = (conn.id < this.instanceId) ? LEFT_INDEX : RIGHT_INDEX
  var oldConn = this._connections[index]
  this._connections[index] = conn
  if (oldConn) oldConn.destroy()

  // TODO is cleaning up the listeners necessary?
  conn.on('data', this._onData.bind(this, conn))
  conn.on('close', this._onClose.bind(this, conn))
  conn.on('error', this._onError.bind(this))
  conn.on('connect', this._onConnect.bind(this, conn))
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
  var index = this._connections.findIndex(function (c) { return c === conn })
  if (index !== -1) {
    this._connections[index] = null
    this._connectionPool.discover(this.topicId, this._onDiscover.bind(this))
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

  this.emit('message', msg)
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

function genID () {
  return Math.round(Math.random() * 9e16).toString()
}

function idCompare (targetID, idA, idB) {
  return Math.abs(targetID - idA) - Math.abs(targetID - idB)
}

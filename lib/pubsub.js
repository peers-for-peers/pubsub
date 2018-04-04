module.exports = PubSub

var EventEmitter = require('events').EventEmitter
var ConnectionPool = require('./connectionpool')
var inherits = require('inherits')

var LEFT_INDEX = 0
var RIGHT_INDEX = 1
var PENDING_CONNECTION = 'pending'

// Emits 'ready', 'message', 'warning'
inherits(PubSub, EventEmitter)
function PubSub (instanceId, topicId, opts) {
  if (!(this instanceof PubSub)) return new PubSub(opts)
  EventEmitter.call(this)

  this._connections = [null, null] // Length two array with [left connection, right connection]
  this._connectionPool = opts.ConnectionPool || new ConnectionPool(opts)
  this._outstanding = {}

  this.ready = false
  this.instanceId = instanceId
  this.topicId = topicId

  this._connectionPool.on('connect', this._onConnect.bind(this))

  this._connectionPool.discoverClosest(instanceId, this._onDiscover.bind(this))
}

PubSub.prototype._onDiscover = function (connId) {
  var self = this
  if (connId === self.instanceId) throw new Error('_onDiscover called with instanceId')

  // TODO simple inequality does not work in the case where the signs of the two IDs are flipped
  var index = (connId < self.instanceId) ? LEFT_INDEX : RIGHT_INDEX
  if (self._connections[index] == null) {
    self._connections[index] = PENDING_CONNECTION
    self._connectionPool.connect(self.topicId, connId, onConnect)
  }

  // If we are still messing a connection then keep discoverying
  return self._connections.findIndex(function (c) { return c == null }) !== -1

  function onConnect (err, conn) {
    if (err) {
      var index = (connId < self.instanceId) ? LEFT_INDEX : RIGHT_INDEX
      if (self._connections[index] === PENDING_CONNECTION) self._connections[index] = null
      self._connectionPool.discoverClosest(self.instanceId, self._onDiscover.bind(self))

      self.emit('warning', err)
    } else {
      self._onConnect(conn)
    }
  }
}

PubSub.prototype._onConnect = function (conn) {
  var index = (conn.id < this.instanceId) ? LEFT_INDEX : RIGHT_INDEX

  // TODO what if the new conn's id is further away than are existing conn?
  if (this._connections[index]) this._connectionPool.disconnect(this.topicId, this._connections[index].id)
  this._connections[index] = conn

  conn.on('message', this._onMessage.bind(this, conn))
  conn.on('disconnect', this._onDisconnect.bind(this, conn))

  // Only emit 'ready' once we have all our needed connections
  if (!this.ready && this._connections.findIndex(function (c) { return c == null }) === -1) {
    this._ready = true
    this.emit('ready')
  }
}

PubSub.prototype._onDisconnect = function (conn) {
  var index = this._connections.findIndex(function (c) { return c === conn })

  if (index === -1) throw new Error('Connection not found in _onDisconnect')

  delete this._connections[index]
  this._connectionPool.discoverClosest(this.instanceId, this._onDiscover.bind(this))
}

PubSub.prototype._onMessage = function (conn, msg) {
  if (this._outstanding[msg.id]) return

  // TODO remove msg from outstanding when we are reasonably sure everyone has received the message

  this._outstanding[msg.id] = msg
  for (var i in this._connections) {
    if (this._connections[i] !== PENDING_CONNECTION) this._connections[i].send(msg)
  }

  this.emit('message', msg)
}

PubSub.prototype.publish = function (msg) {
  this._outstanding[msg.id] = msg
  for (var i in this._connections) {
    if (this._connections[i] !== PENDING_CONNECTION) this._connections[i].send(msg)
  }
}

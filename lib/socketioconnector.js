module.exports = SocketIOConnector

var SocketIOClient = require('socket.io-client')
var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')

inherits(SocketIOConnector, EventEmitter)
function SocketIOConnector (instanceId, opts) {
  EventEmitter.call(this)
  if (!opts) opts = {}

  this.instanceId = instanceId

  this._socketio = SocketIOClient(opts.socketioUrl)
  this._socketio.on('relay', this._onRelay.bind(this))
}

SocketIOConnector.prototype._onRelay = function (msg) {
  this.emit('relay', msg)
}

SocketIOConnector.prototype.discover = function (topicId, cb) {
  var self = this

  self._socketio.on('join-rsp', onRsp)
  self._socketio.emit('join-req', { id: self.instanceId, topic: topicId })

  function onRsp (msg) {
    if (topicId in msg) {
      self._socketio.removeListener('join-rsp', onRsp)
      cb(null, msg[topicId]) // return a list of online instance IDs
    }
  }
}

SocketIOConnector.prototype.relay = function (msg) {
  this._socketio.emit('relay', msg)
}

module.exports = SocketIOConnector

var SocketIOClient = require('socket.io-client')
var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')

inherits(SocketIOConnector, EventEmitter)
function SocketIOConnector (peerID, opts) {
  if (!(this instanceof SocketIOConnector)) return new SocketIOConnector(peerID, opts)
  EventEmitter.call(this)
  if (!opts) opts = {}

  this.peerID = peerID

  this._socketio = SocketIOClient(opts.socketioUrl)
  this._socketio.on('relay', this._onRelay.bind(this))
}

SocketIOConnector.prototype._onRelay = function (msg) {
  if (msg.to !== this.peerID) return
  this.emit('relay', msg)
}

SocketIOConnector.prototype.discover = function (topicID, cb) {
  var self = this

  self._socketio.on('join-rsp', onRsp)
  self._socketio.emit('join-req', { id: self.peerID, topic: topicID })

  function onRsp (msg) {
    if (topicID in msg) {
      self._socketio.removeListener('join-rsp', onRsp)
      cb(null, msg[topicID]) // return a list of online instance IDs
    }
  }
}

SocketIOConnector.prototype.relay = function (msg) {
  this._socketio.emit('relay', msg)
}

SocketIOConnector.prototype.destroy = function () {
  this.removeAllListeners()
  this._socketio.removeAllListeners()
  this._socketio.close()
  this._socketio = null
}

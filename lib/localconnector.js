module.exports = LocalConnector

var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')

var CONNECTORS = {}
var TOPICS = {}

inherits(LocalConnector, EventEmitter)
function LocalConnector (peerID, opts) {
  if (!(this instanceof LocalConnector)) return new LocalConnector(peerID, opts)
  EventEmitter.call(this)
  if (!opts) opts = {}

  this.peerID = peerID

  CONNECTORS[peerID] = this
}

LocalConnector.prototype.discover = function (topicID, cb) {
  var self = this

  if (!TOPICS[topicID]) TOPICS[topicID] = {}
  TOPICS[topicID][self.peerID] = true

  cb(null, Object.keys(TOPICS[topicID]).filter(function (pID) { return pID !== self.peerID }))
}

LocalConnector.prototype.relay = function (msg) {
  CONNECTORS[msg.to].emit('relay', msg)
}

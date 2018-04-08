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
function PubSub (topicID, opts) {
  if (!(this instanceof PubSub)) return new PubSub(topicID, opts)
  if (!opts) opts = {}
  EventEmitter.call(this)

  this.peerID = genID()
  this.topicID = topicID

  this._peers = [null, null] // Length two array with [left connection, right connection]
  this._pendingMessages = [{}, {}]
  this._connector = opts.connector || new SocketIOConnector(this.peerID, opts)

  this._connector.on('relay', this._onConnectorRelay.bind(this))

  debug('new PubSub()', 'peerID=' + this.peerID, 'topicID=' + topicID, opts)

  this._connector.discover(topicID, this._onConnectorDiscover.bind(this))
}

PubSub.prototype._onConnectorDiscover = function (err, onlinePeerIDs) {
  if (err) throw err // TODO handle more gracefully
  debug('DISCOVERED', onlinePeerIDs)
  onlinePeerIDs.sort(idCompare.bind(null, this.peerID))
  for (var i in onlinePeerIDs) {
    var pID = onlinePeerIDs[i]
    if (pID === this.peerID) continue

    var index = (pID < this.peerID) ? LEFT_INDEX : RIGHT_INDEX
    if (this._peers[index] == null) {
      this._setupConnection(pID, true)
    }
  }
}

PubSub.prototype._onPeerConnect = function (peer) {
  // Send all the outstanding messages that accumilated while the peer was not connected
  var index = this._peers.findIndex(function (p) { return p === peer })
  for (var key in this._pendingMessages[index]) {
    peer.send(JSON.stringify(this._pendingMessages[index][key]))
  }
  this._pendingMessages[index] = {}
}

PubSub.prototype._onPeerClose = function (peer) {
  debug('CLOSED', 'target=' + peer.id)
  var index = this._peers.findIndex(function (p) { return p === peer })
  if (index !== -1) {
    this._peers[index] = null
    this._connector.discover(this.topicID, this._onConnectorDiscover.bind(this))
  }
}

PubSub.prototype._onPeerData = function (peer, stringMsg) {
  var msg = JSON.parse(stringMsg)

  debug('MESSAGE', msg)

  for (var i in this._peers) {
    var p = this._peers[i]
    if (p === peer) continue
    if (p && p.connected) p.send(stringMsg)
    else this._pendingMessages[i][msg.id] = msg
  }

  this.emit('message', msg.payload)
}

PubSub.prototype._onPeerError = function (peer, err) {
  debug('WARNING', 'target=' + peer.id, err)
  this.emit('warning', err)
}

PubSub.prototype.publish = function (payload) {
  var msg = {
    id: genID(),
    payload: payload
  }

  debug('PUBLISH', msg)

  for (var i in this._peers) {
    var peer = this._peers[i]
    if (peer && peer.connected) peer.send(JSON.stringify(msg))
    else this._pendingMessages[i][msg.id] = msg
  }
}

PubSub.prototype._onConnectorRelay = function (msg) {
  debug('ONRELAY', 'from=' + msg.from, 'to=' + msg.to, msg.signal)
  var peer = this._peers.find(function (p) { return p && p.id === msg.from })
  if (peer == null) {
    this._setupConnection(msg.from, false) // _setupConnection() updates this._peers
    peer = this._peers.find(function (p) { return p && p.id === msg.from })
  }

  peer.signal(msg.signal)
}

PubSub.prototype._onPeerSignal = function (peer, signal) {
  debug('SIGNALING', 'target=' + peer.id, signal)
  this._connector.relay({
    to: peer.id,
    from: this.peerID,
    signal: signal
  })
}

PubSub.prototype._setupConnection = function (peerID, initiator) {
  debug('CONNECTING', 'target=' + peerID, 'initiator=' + initiator)

  var simplepeer = new SimplePeer({ initiator: initiator })

  simplepeer.id = peerID

  // TODO is removing the listeners necessary?
  simplepeer.on('data', this._onPeerData.bind(this, simplepeer))
  simplepeer.on('close', this._onPeerClose.bind(this, simplepeer))
  simplepeer.on('error', this._onPeerError.bind(this, simplepeer))
  simplepeer.on('connect', this._onPeerConnect.bind(this, simplepeer))
  simplepeer.on('signal', this._onPeerSignal.bind(this, simplepeer))

  // TODO what if the new simplepeer's id is further away than are existing simplepeer?
  var index = (peerID < this.peerID) ? LEFT_INDEX : RIGHT_INDEX
  var oldPeer = this._peers[index]
  this._peers[index] = simplepeer
  if (oldPeer) oldPeer.destroy()
}

function genID () {
  return Math.round(Math.random() * 9e16).toString()
}

function idCompare (targetID, idA, idB) {
  return Math.abs(targetID - idA) - Math.abs(targetID - idB)
}

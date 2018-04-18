module.exports = PubSub

var EventEmitter = require('events').EventEmitter
var SimplePeer = require('simple-peer')
var inherits = require('inherits')
var randombytes = require('randombytes')
var bigInteger = require('big-integer')
var debug = require('debug')('pubsub')
var SocketIOConnector = require('./socketioconnector.js')

var LEFT_INDEX = 0
var RIGHT_INDEX = 1

var ID_BYTES = 16
var ID_BASE = 16
var ID_ENCODING = 'hex'
var ID_MAX = bigInteger(2).pow(ID_BYTES * 8).minus(1)

// Emits 'message', 'warning'
inherits(PubSub, EventEmitter)
function PubSub (topicID, opts) {
  if (!(this instanceof PubSub)) return new PubSub(topicID, opts)
  if (!opts) opts = {}
  EventEmitter.call(this)

  this.peerID = opts.peerID || randombytes(ID_BYTES).toString(ID_ENCODING)
  this.topicID = topicID

  this._peers = [null, null] // Length two array with [left connection, right connection]
  this._pendingMessages = [{}, {}]
  this._connector = new (opts.Connector || SocketIOConnector)(this.peerID, opts)

  this._connector.on('relay', this._onConnectorRelay.bind(this))

  debug('new PubSub()', 'peerID=' + this.peerID, 'topicID=' + topicID, opts)

  this._connector.discover(topicID, this._onConnectorDiscover.bind(this))
}

PubSub.prototype._onConnectorDiscover = function (err, onlinePeerIDs) {
  if (err) throw err // TODO handle more gracefully
  debug('DISCOVERED', onlinePeerIDs)
  onlinePeerIDs.sort(idDistanceComparator.bind(null, this.peerID))
  for (var i in onlinePeerIDs) {
    var pID = onlinePeerIDs[i]
    if (pID === this.peerID) continue

    var index = this._getPeerIndex(pID)
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
    id: randombytes(8).toString(ID_ENCODING),
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

  var peer = new SimplePeer({ initiator: initiator })

  peer.id = peerID

  // TODO is removing the listeners necessary?
  peer.on('data', this._onPeerData.bind(this, peer))
  peer.on('close', this._onPeerClose.bind(this, peer))
  peer.on('error', this._onPeerError.bind(this, peer))
  peer.on('connect', this._onPeerConnect.bind(this, peer))
  peer.on('signal', this._onPeerSignal.bind(this, peer))

  // TODO what if the new peer's id is further away than are existing peer?
  var index = this._getPeerIndex(peerID)
  var oldPeer = this._peers[index]
  this._peers[index] = peer
  if (oldPeer) oldPeer.destroy()
}

/* Returns the index of `_peers` that the given `peerID` should be stored at
 *
 * The index is determined by wheter the given `peerID` is to the right (clockwise)
 * or left (counter-clockwise) of this peer's id in the circular id space
 */

PubSub.prototype._getPeerIndex = function (peerID) {
  return idDistance(this.peerID, peerID).lesser(0) ? LEFT_INDEX : RIGHT_INDEX
}

/* Calculates the distance between two IDs
 *
 * The IDs form a circular ring where id:0x0001 comes after id:0x0000
 * and id:0xFFFF comes before id:0x0000.
 *
 * Calculating the distance requires calculating the clockwise and
 * couter-clockwise distance in order to find the shorter one.
 *
 * A negative distance indicates that idA is to the left (counter-clockwise)
 * to idB and vice versa for a postive distance
 */
function idDistance (idA, idB) {
  idA = bigInteger(idA, ID_BASE)
  idB = bigInteger(idB, ID_BASE)

  // Distance from idB to idA
  var dist1 = idB.minus(idA)

  // Distance from idB to idA going all the around the id space
  var dist2 = ID_MAX.minus(idB).plus(idA).plus(1).times(-1)

  // Return the shortest distance
  return dist1.abs().compare(dist2.abs()) === -1 ? dist1 : dist2
}

// Compares idA/B's absolute distance to the targetID
function idDistanceComparator (targetID, idA, idB) {
  targetID = bigInteger(targetID, ID_BASE)
  idA = bigInteger(idA, ID_BASE)
  idB = bigInteger(idB, ID_BASE)

  var distA = idDistance(targetID, idA).abs()
  var distB = idDistance(targetID, idB).abs()

  return distA.compare(distB)
}

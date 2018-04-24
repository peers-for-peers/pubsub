const EventEmitter = require('events').EventEmitter
const SimplePeer = require('simple-peer')
const debug = require('debug')('pubsub')
const SocketIOConnector = require('./socketioconnector.js')

const id = require('./id.js')

const RelativeIndex = {
  LEFT_INDEX: 0,
  RIGHT_INDEX: 1
}

// Emits 'message', 'peer-connect', 'peer-close', 'warning'
class PubSub extends EventEmitter {
  constructor (topicID, opts = {}) {
    super()

    this.peerID = opts.peerID || id.createRandom()
    this.topicID = topicID
    this.destroyed = false

    if (!id.isValid(this.peerID)) throw new Error('Invalid peerID: ' + this.peerID)

    this._peers = [null, null] // Length two array with [left connection, right connection]
    this._pendingMessages = [{}, {}]
    this._receivedMessages = {}
    this._connector = new (opts.Connector || SocketIOConnector)(this.peerID, opts)

    this._connector.on('relay', this._onConnectorRelay.bind(this))

    debug('new PubSub()', 'peerID=' + this.peerID, 'topicID=' + topicID, opts)

    this._connector.discover(topicID, this._onConnectorDiscover.bind(this))
  }

  _onConnectorDiscover (err, onlinePeerIDs) {
    let self = this

    if (this.destroyed) return
    if (err) return this._destroy(err)

    debug('DISCOVERED', onlinePeerIDs)

    // TODO [optimization] : terminate after setting the left and right peer
    onlinePeerIDs.sort(
      (...args) => id.distanceComparator(self.peerID, ...args)
    ).filter(
      (pID) => pID !== self.peerID && self._peers[self._getPeerIndex(pID)] === null
    ).forEach(
      (pID) => self._setupConnection(pID, true)
    )
  }

  _onPeerConnect (peer) {
    // Send all the outstanding messages that accumilated while the peer was not connected
    const index = this._peers.findIndex((p) => p === peer)
    Object.values(this._pendingMessages[index]).map(
      (p) => peer.send(JSON.stringify(p))
    )

    this._pendingMessages[index] = {}
    this.emit('peer-connect', peer.id)
  }

  _onPeerClose (peer) {
    if (this.destroyed) return

    debug('CLOSED', 'target=' + peer.id)

    const index = this._peers.findIndex((p) => p === peer)
    if (index !== -1) {
      this._peers[index] = null
      this._connector.discover(this.topicID, this._onConnectorDiscover.bind(this))
    }

    this.emit('peer-close', peer.id)
  }

  _onPeerData (peer, stringMsg) {
    let self = this

    const msg = JSON.parse(stringMsg)

    if (this._receivedMessages[msg.id]) return
    this._receivedMessages[msg.id] = true

    debug('MESSAGE', msg)

    this._peers.filter(
      (p) => p !== peer
    ).forEach(
      (p, i) => {
        if (p && p.connected) p.send(stringMsg)
        else self._pendingMessages[i][msg.id] = msg
      }
    )

    this.emit('message', msg.payload)
  }

  _onPeerError (peer, err) {
    debug('WARNING', 'target=' + peer.id, err)
    this.emit('warning', err)
  }

  publish (payload) {
    if (this.destroyed) throw new Error('Instance is destroyed')

    let self = this

    const msg = {
      id: id.createRandom(8),
      payload: payload
    }

    debug('PUBLISH', msg)

    this._receivedMessages[msg.id] = true

    this._peers.forEach(
      (p, i) => {
        if (p && p.connected) {
          console.log(self.id + ' -> ' + p.id)
          p.send(JSON.stringify(msg))
        } else {
          self._pendingMessages[i][msg.id] = msg
        }
      }
    )
  }

  _onConnectorRelay (msg) {
    debug('ONRELAY', 'from=' + msg.from, 'to=' + msg.to)

    let peer = this._peers.find((p) => p && p.id === msg.from)

    if (peer == null) {
      // NOTE that _setupConnection() updates this._peers
      this._setupConnection(msg.from, false)
      peer = this._peers.find((p) => p && p.id === msg.from)
    }

    peer.signal(msg.signal)
  }

  _onPeerSignal (peer, signal) {
    debug('SIGNALING', 'target=' + peer.id)

    this._connector.relay({
      to: peer.id,
      from: this.peerID,
      signal: signal
    })
  }

  _setupConnection (peerID, initiator) {
    let self = this

    debug('CONNECTING', 'target=' + peerID, 'initiator=' + initiator)

    let peer = new SimplePeer({ initiator: initiator })
    peer.id = peerID

    // TODO : stop removing listeners; it doesn't seem to do anything

    const onClose = () => {
      Object.keys(listeners).forEach((name) => peer.removeListener(name, listeners[name]))
      self._onPeerClose(peer)
    }

    const listeners = {
      data: this._onPeerData.bind(this, peer),
      error: this._onPeerError.bind(this, peer),
      connect: this._onPeerConnect.bind(this, peer),
      signal: this._onPeerSignal.bind(this, peer),
      close: onClose
    }

    // Set up all of the listeners for the given peer
    Object.keys(listeners).forEach((name) => peer.on(name, listeners[name]))

    // TODO what if the new peer's id is further away than are existing peer?
    const index = self._getPeerIndex(peerID)
    const oldPeer = self._peers[index]
    self._peers[index] = peer
    if (oldPeer) oldPeer.destroy()
  }

  /* Returns the index of `_peers` that the given `peerID` should be stored at
   *
   * The index is determined by wheter the given `peerID` is to the right (clockwise)
   * or left (counter-clockwise) of this peer's id in the circular id space
   */
  _getPeerIndex (peerID) {
    return id.distance(this.peerID, peerID).lesser(0) ? RelativeIndex.LEFT_INDEX : RelativeIndex.RIGHT_INDEX
  }

  _destroy (err) {
    if (this.destroyed) return
    this.destroyed = true

    this._connector.destroy()

    // Destroy all of the active peers
    this._peers.filter(
      (p) => p !== null
    ).forEach(
      (p) => p.destroy()
    )

    this._peers = null
    this._pendingMessages = null
    this._connector = null

    if (err) this.emit(err)
    this.removeAllListeners()
  }

  destroy () {
    this._destroy()
  }
}

module.exports = PubSub

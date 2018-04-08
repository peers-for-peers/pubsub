module.exports.start = start

var express = require('express')
var HttpServer = require('http').Server
var SocketIO = require('socket.io')
var process = require('process')
var debug = require('debug')('pubsub')
var port = process.env.PORT ? Number(process.env.PORT) : 3000

function start (httpServer) {
  if (httpServer == null) {
    var app = express()
    httpServer = HttpServer(app)
    app.use(express.static('.'))
    httpServer.listen(port, function () {
      console.log('listening on *:' + port)
    })
  }
  var io = SocketIO(httpServer)
  io.on('connection', onConnection.bind(null, io))
}

function onConnection (io, socket) {
  debug('CONNECT')

  socket.on('disconnect', function () {
    debug('DISCONNECT')
  })

  socket.on('join-req', function (msg) {
    socket.peerID = msg.id

    debug('JOIN', 'id=' + msg.id, 'topic=' + msg.topic)

    socket.join(msg.topic)
    io.in(msg.topic).clients((err, socketIDs) => {
      var idList = []
      if (err) {
        debug('ERROR', 'in io.clients()', err)
      } else {
        idList = socketIDs.filter(sid => sid !== socket.id).map(sid => io.sockets.connected[sid].peerID)
      }
      var rsp = {}
      rsp[msg.topic] = idList
      debug('DISCOVERED', rsp)
      socket.emit('join-rsp', rsp)
    })
  })

  socket.on('relay', function (msg) {
    var recipientID = Object.keys(io.sockets.connected).find(sId => io.sockets.connected[sId].peerID === msg.to)
    if (recipientID != null) {
      debug('RELAY', 'to=' + msg.to, 'from=' + msg.from)
      io.sockets.connected[recipientID].emit('relay', msg)
    } else {
      debug('WARN', 'Failed to find peer to relay msg to', 'to=' + msg.to, 'from=' + msg.from)
    }
  })
}

if (require.main === module) {
  start()
}

var express = require('express')
var app = express()
var http = require('http').Server(app)
var io = require('socket.io')(http)
var path = require('path')

app.use(express.static('.'))

app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, '/index.html'))
})

io.on('connection', function (socket) {
  console.log('a user connected')

  socket.on('disconnect', function () {
    console.log('user disconnected')
  })

  socket.on('join-req', function (msg) {
    socket.peerId = msg.id

    socket.join(msg.topic)
    io.in(msg.topic).clients((err, socketIDs) => {
      var idList = []
      if (err) {
        console.log('Error in io.clients()', err)
      } else {
        idList = socketIDs.filter(sid => sid !== socket.id).map(sid => io.sockets.connected[sid].peerId)
      }
      var rsp = {}
      rsp[msg.topic] = idList
      console.log('DISCOVER', rsp)
      socket.emit('join-rsp', rsp)
    })
  })

  socket.on('relay', function (msg) {
    var recipientID = Object.keys(io.sockets.connected).find(sId => io.sockets.connected[sId].peerId === msg.to)
    if (recipientID != null) {
      console.log(`RELAY from=${msg.from} to=${msg.to}`)
      io.sockets.connected[recipientID].emit('relay', msg)
    } else {
      console.log('Failed to find peer to relay msg to')
    }
  })
})

http.listen(3000, function () {
  console.log('listening on *:3000')
})
